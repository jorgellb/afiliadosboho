import { buildFeedXml } from "@/lib/feed";

/**
 * Feed de productos para Google Merchant Center (y catálogos de Meta/Pinterest).
 *
 * Se genera en cada petición desde la base de datos: siempre refleja el
 * catálogo actual, así que no hay nada que «regenerar» cuando se añaden
 * productos. Google lo relee según su propio calendario (a diario por defecto).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const { xml, count } = await buildFeedXml();
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Un rato de caché en el CDN: Google no necesita el dato al segundo y
      // así una descarga no golpea la base de datos.
      "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600",
      // Que no salga en los resultados de búsqueda, pero SIN bloquearlo en
      // robots.txt: Merchant Center lo descarga con Googlebot y un Disallow
      // impediría la descarga.
      "X-Robots-Tag": "noindex",
      "X-Feed-Items": String(count),
    },
  });
}
