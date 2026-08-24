"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SIZES, responsive } from "@/lib/images";

/**
 * "Encuentra este Look" (Módulo D). Sube/pega/arrastra una imagen, se comprime
 * en el navegador (máx 1280px, JPEG 0.8) ANTES de subir, y se muestran las
 * prendas más parecidas del catálogo con su enlace de afiliado.
 */

interface MatchItem {
  productId: string;
  slug: string | null;
  title: string;
  imageUrl: string;
  price: string;
  currency: string;
  similarity: number;
}

interface ResultItem {
  itemName: string;
  type: string;
  matches: MatchItem[];
}

interface SearchResult {
  searchId: string;
  overallStyle: string;
  items: ResultItem[];
  message?: string;
}

function formatPrice(price: string, currency: string): string {
  return new Intl.NumberFormat("es", { style: "currency", currency }).format(
    Number(price)
  );
}

/** Comprime a máx 1024px de lado y JPEG 0.72 con canvas (payload pequeño para
 * el modelo de visión: menos base64 = respuesta más rápida y fiable). */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const max = 1024;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("no blob"))),
      "image/jpeg",
      0.8
    )
  );
}

const STEPS = [
  "Preparando tu imagen…",
  "Detectando las prendas del look…",
  "Buscando piezas parecidas en la tienda…",
];

export function FindMyLook() {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    setLoading(true);
    setStep(0);
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Eso no parece una imagen. Sube una foto del look.");
      }
      const compressed = await compressImage(file);
      setPreview(URL.createObjectURL(compressed));
      setStep(1);
      const form = new FormData();
      form.append("image", compressed, "look.jpg");
      const res = await fetch("/api/find-look", { method: "POST", body: form });
      setStep(2);
      // La respuesta puede no ser JSON (p. ej. timeout de la función devuelve
      // texto): se lee como texto y se intenta parsear con un mensaje amable.
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        setError(
          "El análisis ha tardado demasiado. Prueba de nuevo en un momento o con una imagen más sencilla."
        );
        return;
      }
      if (!res.ok) {
        setError((data.error as string) ?? "No hemos podido analizar el look.");
      } else if (data.message) {
        setError(data.message as string);
      } else {
        setResult(data as unknown as SearchResult);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, []);

  // Pegar con Ctrl+V (gesto clave tras capturar Pinterest).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/")
      );
      const file = item?.getAsFile();
      if (file) runSearch(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [runSearch]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) runSearch(file);
  }

  function trackClick(searchId: string, productId: string) {
    try {
      navigator.sendBeacon(
        "/api/find-look/click",
        new Blob([JSON.stringify({ searchId, productId })], {
          type: "application/json",
        })
      );
    } catch {
      // el clic no debe bloquear la redirección
    }
  }

  const lookTotal =
    result?.items.reduce((sum, it) => sum + (Number(it.matches[0]?.price) || 0), 0) ??
    0;
  const lookCurrency =
    result?.items.find((it) => it.matches[0])?.matches[0]?.currency ?? "EUR";

  return (
    <div className="find-look">
      {!result && (
        <div
          className={`dropzone${dragOver ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => e.target.files?.[0] && runSearch(e.target.files[0])}
          />
          {loading ? (
            <div className="dz-loading">
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Tu look" className="dz-preview" />
              )}
              <p aria-live="polite">{STEPS[step]}</p>
              <span className="dz-spinner" aria-hidden />
            </div>
          ) : (
            <>
              <p className="dz-title">Arrastra una imagen aquí</p>
              <p className="muted">
                o haz clic para elegirla · pégala con <kbd>Ctrl</kbd>+<kbd>V</kbd> ·
                en móvil, usa la cámara
              </p>
            </>
          )}
        </div>
      )}

      {error && !loading && (
        <div className="find-look-error">
          <p className="error-msg">{error}</p>
          <button className="secondary" onClick={() => setError(null)}>
            Probar con otra imagen
          </button>
        </div>
      )}

      <p className="muted find-look-privacy">
        🔒 La imagen se usa solo para buscar productos parecidos y no se guarda
        (se procesa y se descarta). No publicamos imágenes de usuarios.
      </p>

      {result && (
        <div className="find-look-result">
          <div className="fl-source">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Tu look" />
            )}
            <div>
              <p className="hero-kicker">{result.overallStyle}</p>
              <ol className="fl-items-list">
                {result.items.map((it, i) => (
                  <li key={i}>
                    {it.itemName}
                    <span className="muted">
                      {" "}
                      · {it.matches.length} parecido{it.matches.length === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ol>
              {lookTotal > 0 && (
                <p className="fl-total">
                  Recrea este look completo por{" "}
                  <strong>{formatPrice(lookTotal.toFixed(2), lookCurrency)}</strong>
                </p>
              )}
              <button className="secondary" onClick={() => setResult(null)}>
                Buscar otro look
              </button>
            </div>
          </div>

          <div className="fl-matches">
            {result.items.map((it, i) => (
              <section key={i} className="fl-item-block">
                <h2>
                  <span className="fl-item-num">{i + 1}</span> {it.itemName}
                </h2>
                {it.matches.length === 0 ? (
                  <p className="muted">
                    No hemos encontrado nada suficientemente parecido en la
                    tienda para esta pieza.
                  </p>
                ) : (
                  <ul className="product-grid">
                    {it.matches.map((m) => (
                      <li key={m.productId} className="product-card">
                        <a
                          className="card-media"
                          href={`/go/${m.productId}?src=find-look`}
                          target="_blank"
                          rel="nofollow sponsored noopener"
                          onClick={() => trackClick(result.searchId, m.productId)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                          {...responsive(m.imageUrl, SIZES.grid)}
                          alt={m.title}
                          loading="lazy"
                          decoding="async"
                          width={480}
                          height={480}
                        />
                          <span className="fl-similarity">
                            {Math.round(m.similarity * 100)}% parecido
                          </span>
                        </a>
                        <h3>{m.title}</h3>
                        <p className="price">{formatPrice(m.price, m.currency)}</p>
                        <a
                          className="buy-link"
                          href={`/go/${m.productId}?src=find-look`}
                          target="_blank"
                          rel="nofollow sponsored noopener"
                          onClick={() => trackClick(result.searchId, m.productId)}
                        >
                          Comprar
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <p className="muted">
            ¿No encuentras lo que buscas? Prueba con{" "}
            <Link href="/asistente">la estilista</Link> o{" "}
            <Link href="/">explora la tienda</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
