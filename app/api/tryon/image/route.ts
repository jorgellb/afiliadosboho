import { NextResponse } from "next/server";

/**
 * Proxy de imágenes de producto para el probador AR. Sirve la imagen desde
 * nuestro propio origen (con CORS) para que el navegador pueda dibujarla en un
 * canvas y recortarle el fondo sin "manchar" el canvas (taint) ni romper la
 * captura. No guarda nada: es un simple passthrough con caché de CDN.
 */
const ALLOWED_HOSTS = /(^|\.)aliexpress-media\.com$|(^|\.)alicdn\.com$/;

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Falta url" }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }
  // Guard anti-SSRF: solo imágenes del CDN de producto.
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.test(parsed.hostname)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const upstream = await fetch(parsed.toString(), { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "No se pudo cargar la imagen" }, { status: 502 });
  }
  const contentType = upstream.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "El recurso no es una imagen" }, { status: 415 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
