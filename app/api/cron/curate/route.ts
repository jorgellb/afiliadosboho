import { NextResponse } from "next/server";
import { curateCatalog } from "@/lib/curator";

export const maxDuration = 120;

/** Cron semanal: el agente añade productos nuevos al catálogo (vercel.json). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const summary = await curateCatalog();
  return NextResponse.json(summary);
}
