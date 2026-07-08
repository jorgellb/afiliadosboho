"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Probador AR de accesorios (Módulo B). Todo ocurre en el navegador: ni la
 * cámara ni la foto salen del dispositivo. Usa MediaPipe FaceLandmarker para
 * anclar el accesorio (con el fondo liso recortado en canvas) según su
 * anchor_point.
 */

interface Product {
  id: string;
  title: string;
  imageUrl: string;
}

interface Asset {
  anchorPoint: string | null;
  widthRatio: number | null;
  subcategory: string | null;
  originalUrl: string | null;
}

// Índices de landmarks de MediaPipe Face Mesh (468 puntos).
const LM = {
  foreheadTop: 10,
  chin: 152,
  eyeL: 33,
  eyeR: 263,
  cheekL: 234,
  cheekR: 454,
  earL: 177,
  earR: 401,
};

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Caché de accesorios recortados por producto (evita reprocesar en la sesión).
const overlayCache = new Map<string, HTMLCanvasElement>();

type CamState = "idle" | "loading" | "active" | "denied" | "unsupported" | "error";

/**
 * Quita el fondo LISO (blanco/claro, típico de las fotos de producto) con un
 * relleno por inundación desde los bordes: solo borra el fondo continuo con los
 * bordes y dentro de una tolerancia de color, así conserva el accesorio aunque
 * tenga zonas claras en su interior. Cero dependencias, instantáneo.
 */
function removeFlatBackground(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;

  // Color de fondo de referencia: media de las cuatro esquinas.
  const cornerIdx = [0, w - 1, (h - 1) * w, (h - 1) * w + (w - 1)];
  let br = 0, bg = 0, bb = 0;
  for (const c of cornerIdx) {
    br += d[c * 4];
    bg += d[c * 4 + 1];
    bb += d[c * 4 + 2];
  }
  br /= 4;
  bg /= 4;
  bb /= 4;

  // Si las esquinas no son claras ni uniformes, probablemente no es una foto de
  // producto sobre fondo liso: no arriesgamos a recortar de más.
  const TOL2 = 46 * 46;
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) {
    stack.push(x, (h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    stack.push(y * w, y * w + (w - 1));
  }
  const near = (i: number) => {
    const p = i * 4;
    const dr = d[p] - br, dg = d[p + 1] - bg, db = d[p + 2] - bb;
    return dr * dr + dg * dg + db * db <= TOL2;
  };
  while (stack.length) {
    const idx = stack.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;
    if (!near(idx)) continue;
    d[idx * 4 + 3] = 0; // píxel de fondo → transparente
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) stack.push(idx - 1);
    if (x < w - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - w);
    if (y < h - 1) stack.push(idx + w);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function ARTryOn({ product }: { product: Product }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const landmarkerRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lerpRef = useRef<Record<string, { x: number; y: number }>>({});

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loadingAsset, setLoadingAsset] = useState(true);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [cam, setCam] = useState<CamState>("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);

  const proxied = `/api/tryon/image?url=${encodeURIComponent(product.imageUrl)}`;

  // 1. Preparar el producto (clasificación cacheada en el servidor).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/products/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: product.id,
            imageUrl: product.imageUrl,
            title: product.title,
          }),
        });
        const data = await res.json();
        if (!alive) return;
        if (!res.ok) setPrepError(data.error ?? "No se pudo preparar la pieza.");
        else setAsset(data.asset);
      } catch {
        if (alive) setPrepError("Error de red al preparar la pieza.");
      } finally {
        if (alive) setLoadingAsset(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [product.id, product.imageUrl, product.title]);

  // Carga la imagen del producto (proxy same-origin) y le recorta el fondo liso.
  const loadOverlay = useCallback(async (): Promise<HTMLCanvasElement> => {
    if (overlayCache.has(product.id)) return overlayCache.get(product.id)!;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = proxied;
    await img.decode();
    const canvas = removeFlatBackground(img);
    overlayCache.set(product.id, canvas);
    return canvas;
  }, [product.id, proxied]);

  const lerp = (key: string, x: number, y: number) => {
    const prev = lerpRef.current[key];
    const next = prev
      ? { x: prev.x + (x - prev.x) * 0.3, y: prev.y + (y - prev.y) * 0.3 }
      : { x, y };
    lerpRef.current[key] = next;
    return next;
  };

  const drawImageCentered = (
    ctx: CanvasRenderingContext2D,
    img: HTMLCanvasElement,
    cx: number,
    cy: number,
    targetW: number,
    angle = 0
  ) => {
    const ratio = img.height / img.width || 1;
    const targetH = targetW * ratio;
    ctx.save();
    ctx.translate(cx, cy);
    if (angle) ctx.rotate(angle);
    ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();
  };

  // Dibuja el accesorio sobre los landmarks según su anchor_point.
  const drawOverlay = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      landmarks: Array<{ x: number; y: number }>,
      w: number,
      h: number
    ) => {
      const img = overlayRef.current;
      if (!img || !asset?.anchorPoint || !asset.widthRatio) return;
      // Coordenadas en el lienzo espejado.
      const P = (i: number) => ({ x: w - landmarks[i].x * w, y: landmarks[i].y * h });
      const faceW = Math.abs(P(LM.cheekR).x - P(LM.cheekL).x);
      const faceH = Math.abs(P(LM.chin).y - P(LM.foreheadTop).y);
      const targetW = faceW * asset.widthRatio;

      switch (asset.anchorPoint) {
        case "face": {
          const l = P(LM.eyeL);
          const r = P(LM.eyeR);
          const c = lerp("face", (l.x + r.x) / 2, (l.y + r.y) / 2);
          const angle = Math.atan2(r.y - l.y, r.x - l.x);
          drawImageCentered(ctx, img, c.x, c.y, targetW, angle);
          break;
        }
        case "head": {
          const base = P(LM.foreheadTop);
          const c = lerp("head", base.x, base.y - faceH * 0.4);
          drawImageCentered(ctx, img, c.x, c.y, targetW);
          break;
        }
        case "neck": {
          const base = P(LM.chin);
          const c = lerp("neck", base.x, base.y + faceH * 0.4);
          drawImageCentered(ctx, img, c.x, c.y, targetW);
          break;
        }
        case "left_ear":
        case "right_ear": {
          // Pendientes: se dibujan en ambas orejas.
          const el = lerp("earL", P(LM.earL).x, P(LM.earL).y);
          const er = lerp("earR", P(LM.earR).x, P(LM.earR).y);
          const earW = targetW;
          const earH = earW * (img.height / img.width || 1);
          drawImageCentered(ctx, img, el.x, el.y + earH / 2, earW);
          drawImageCentered(ctx, img, er.x, er.y + earH / 2, earW);
          break;
        }
      }
    },
    [asset]
  );

  // Crea el FaceLandmarker probando GPU y, si falla, CPU (algunos móviles/PC
  // no soportan el delegate GPU y era una causa de "a veces no funciona").
  async function createLandmarker(mode: "VIDEO" | "IMAGE") {
    const { FaceLandmarker, FilesetResolver } = await import(
      "@mediapipe/tasks-vision"
    );
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    for (const delegate of ["GPU", "CPU"] as const) {
      try {
        return await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: mode,
          numFaces: 1,
        });
      } catch (e) {
        if (delegate === "CPU") throw e;
      }
    }
  }

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // 2. Activar cámara y arrancar el bucle de render.
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCam("unsupported");
      return;
    }
    setCam("loading");
    setBusy("Preparando la pieza…");
    try {
      // La cámara primero (gesto del usuario): si se deniega, salimos limpio.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      if (!video.videoWidth) {
        await new Promise<void>((r) =>
          video.addEventListener("loadedmetadata", () => r(), { once: true })
        );
      }

      setBusy("Ajustando la pieza…");
      overlayRef.current = await loadOverlay();
      if (!landmarkerRef.current) {
        landmarkerRef.current = await createLandmarker("VIDEO");
      }

      const canvas = canvasRef.current!;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d")!;
      setCam("active");
      setBusy(null);

      const loop = () => {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();
        try {
          const res = landmarkerRef.current.detectForVideo(video, performance.now());
          const lm = res.faceLandmarks?.[0];
          if (lm) drawOverlay(ctx, lm, w, h);
        } catch {
          // frame suelto: se ignora
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (error) {
      setBusy(null);
      stopCamera();
      const name = (error as Error).name;
      if (name === "NotAllowedError" || name === "SecurityError") setCam("denied");
      else if (name === "NotFoundError" || name === "NotReadableError")
        setCam("unsupported");
      else setCam("error"); // fallo al cargar el modelo/red, etc.
    }
  }

  // Fallback: probar sobre una foto estática subida por el usuario.
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy("Analizando tu foto…");
    try {
      overlayRef.current = await loadOverlay();
      const imgLandmarker = await createLandmarker("IMAGE");
      if (!imgLandmarker) throw new Error("landmarker");
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current!;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      // Foto estática: no se espeja.
      ctx.drawImage(bitmap, 0, 0);
      const res = imgLandmarker.detect(bitmap);
      const lm = res.faceLandmarks?.[0];
      if (lm) {
        // Reutiliza la lógica de dibujo pero SIN espejar: x directo.
        const w = canvas.width;
        const h = canvas.height;
        const unmirror = lm.map((p: { x: number; y: number }) => ({
          x: 1 - p.x,
          y: p.y,
        }));
        drawOverlay(ctx, unmirror, w, h);
        setCam("active");
      } else {
        setBusy("No hemos detectado una cara en la foto. Prueba con otra.");
        return;
      }
      setBusy(null);
    } catch {
      setBusy("No se pudo procesar la foto.");
    }
  }

  function capture() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setCaptured(url);
    }, "image/jpeg", 0.92);
  }

  // --- Render ---
  if (loadingAsset) {
    return <p className="muted ar-status">Preparando el probador…</p>;
  }
  if (prepError) {
    return <p className="error-msg ar-status">{prepError}</p>;
  }
  if (!asset?.anchorPoint) {
    return (
      <p className="muted ar-status">
        Esta pieza no se puede probar con la cámara (solo accesorios que se
        llevan en cara, orejas, cuello o cabeza).
      </p>
    );
  }

  return (
    <div className="ar-tryon">
      <div className="ar-stage">
        <video ref={videoRef} playsInline muted style={{ display: "none" }} />
        <canvas ref={canvasRef} className="ar-canvas" />
        {cam !== "active" && (
          <div className="ar-overlay-cta">
            {busy ? (
              <p>{busy}</p>
            ) : cam === "denied" ? (
              <>
                <p>No pudimos acceder a la cámara.</p>
                <label className="btn-ghost ar-upload">
                  Probar con una foto
                  <input type="file" accept="image/*" onChange={onPhoto} hidden />
                </label>
              </>
            ) : cam === "unsupported" ? (
              <>
                <p>No encontramos una cámara disponible.</p>
                <label className="btn-ghost ar-upload">
                  Probar con una foto
                  <input type="file" accept="image/*" onChange={onPhoto} hidden />
                </label>
              </>
            ) : cam === "error" ? (
              <>
                <p>No se pudo iniciar el probador. Revisa tu conexión.</p>
                <button className="btn-ghost" onClick={startCamera}>
                  Reintentar
                </button>
                <label className="ar-upload-link">
                  o <input type="file" accept="image/*" onChange={onPhoto} hidden />
                  <span>sube una foto</span>
                </label>
              </>
            ) : (
              <>
                <button className="btn-primary" onClick={startCamera}>
                  Activar cámara
                </button>
                <label className="ar-upload-link">
                  o <input type="file" accept="image/*" onChange={onPhoto} hidden />
                  <span>sube una foto</span>
                </label>
              </>
            )}
          </div>
        )}
      </div>

      <p className="muted ar-privacy">
        🔒 Tu cámara no sale de tu dispositivo: la prueba se genera en tu propio
        navegador y no se envía nada a ningún servidor.
      </p>

      {cam === "active" && (
        <div className="ar-actions">
          <button onClick={capture}>Capturar look</button>
          <button className="secondary" onClick={() => { stopCamera(); setCam("idle"); }}>
            Terminar
          </button>
        </div>
      )}

      {captured && (
        <div className="ar-captured">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={captured} alt="Tu look" />
          <a className="btn-primary" href={captured} download="mi-look-boho.jpg">
            Descargar
          </a>
        </div>
      )}
    </div>
  );
}
