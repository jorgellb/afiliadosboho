import { NextResponse } from "next/server";
import { refreshStalePrices } from "@/lib/refresh";

export const maxDuration = 60;

/**
 * Cron de Vercel (ver vercel.json). Vercel envía automáticamente
 * `Authorization: Bearer ${CRON_SECRET}` cuando la variable existe.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const summary = await refreshStalePrices();
  return NextResponse.json(summary);
}
