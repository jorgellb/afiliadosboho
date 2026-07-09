import { NextResponse } from "next/server";
import { z } from "zod";
import { generateArticles } from "@/lib/content";

export const maxDuration = 120;

const bodySchema = z
  .object({ count: z.number().int().min(1).max(5) })
  .partial()
  .optional();

/** Genera artículos de la revista pendientes (botón del dashboard). */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  const count = parsed.success ? (parsed.data?.count ?? 3) : 3;
  try {
    const summary = await generateArticles(count);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Error generando artículos:", error);
    return NextResponse.json(
      { error: "No se pudieron generar los artículos" },
      { status: 500 }
    );
  }
}
