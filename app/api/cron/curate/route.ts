import { NextResponse } from "next/server";
import { runDailyPipeline } from "@/lib/pipeline";
import { generateArticles } from "@/lib/content";

export const maxDuration = 300;

/**
 * Cron DIARIO de catálogo (ver vercel.json, 05:00 UTC).
 *
 * Va una hora antes que el de precios para que las piezas que entren hoy ya
 * tengan ficha cuando aquel pase a refrescarlas.
 *
 * Vercel Hobby solo admite DOS crons y ambos están ocupados, así que el
 * artículo semanal de la revista viaja dentro de este mismo disparo en vez de
 * tener el suyo: se redacta solo los lunes, comprobando el día aquí.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const pipeline = await runDailyPipeline();

  // Un artículo por semana. Redactarlo a diario llenaría la revista de relleno,
  // que es justo lo que penaliza Google.
  let content = null;
  if (new Date().getUTCDay() === 1) {
    try {
      content = await generateArticles(1);
    } catch (error) {
      content = {
        generated: 0,
        errors: [error instanceof Error ? error.message : "error"],
      };
    }
  }

  return NextResponse.json({ ...pipeline, content });
}
