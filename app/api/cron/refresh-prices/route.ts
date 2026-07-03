import { NextResponse } from "next/server";
import { refreshStalePrices } from "@/lib/refresh";
import { generateMissingSeo, SeoSummary } from "@/lib/seo";

export const maxDuration = 120;

/**
 * Cron de Vercel (ver vercel.json). Vercel envía automáticamente
 * `Authorization: Bearer ${CRON_SECRET}` cuando la variable existe.
 * Además de refrescar precios, redacta fichas SEO pendientes.
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
  return NextResponse.json({ ...summary, seo });
}
