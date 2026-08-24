import { NextResponse } from "next/server";
import { z } from "zod";
import { runDailyPipeline } from "@/lib/pipeline";

// Curar nueve categorías y redactar hasta 30 fichas es un trabajo largo.
export const maxDuration = 300;

const bodySchema = z
  .object({
    perCategory: z.number().int().min(1).max(6).optional(),
    seoLimit: z.number().int().min(1).max(40).optional(),
  })
  .optional();

/**
 * Disparo manual del pipeline diario desde el panel.
 *
 * Es el mismo código que ejecuta el cron: buscar piezas en todas las
 * categorías, redactar las fichas pendientes y reindexar. Tenerlo en un botón
 * permite comprobar que funciona sin esperar a las 05:00.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(
    await request.json().catch(() => undefined)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const summary = await runDailyPipeline(parsed.data ?? {});
  return NextResponse.json(summary);
}
