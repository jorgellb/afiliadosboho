import { NextResponse } from "next/server";
import { refreshStalePrices } from "@/lib/refresh";

export const maxDuration = 60;

/** Disparo manual del refresco de precios desde el dashboard admin. */
export async function POST() {
  const summary = await refreshStalePrices();
  return NextResponse.json(summary);
}
