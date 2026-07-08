import { NextResponse } from "next/server";
import { refreshStalePrices } from "@/lib/refresh";
import { generateMissingSeo, SeoSummary } from "@/lib/seo";
import { cleanupExpiredSearches, embedBatch } from "@/lib/find-look";

export const maxDuration = 120;

/**
 * Cron diario único (ver vercel.json). Vercel envía automáticamente
 * `Authorization: Bearer ${CRON_SECRET}`. Hace en una sola invocación:
 * refrescar precios, redactar fichas SEO pendientes, indexar un lote de
 * productos nuevos para "Encuentra este Look" y limpiar búsquedas caducadas.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const summary = await refreshStalePrices();

  let seo: SeoSummary = { generated: 0, errors: [] };
  try {
    seo = await generateMissingSeo(5);
  } catch (error) {
    seo.errors.push(error instanceof Error ? error.message : "error SEO");
  }

  // Índice de "Encuentra este Look": un lote de productos nuevos + limpieza.
  let embed = null;
  let cleaned = 0;
  try {
    embed = await embedBatch(15);
  } catch (error) {
    console.error("Cron embed-batch:", error);
  }
  try {
    cleaned = await cleanupExpiredSearches();
  } catch (error) {
    console.error("Cron cleanup búsquedas:", error);
  }

  return NextResponse.json({ ...summary, seo, embed, cleanedSearches: cleaned });
}
