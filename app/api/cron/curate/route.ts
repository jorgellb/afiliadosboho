import { NextResponse } from "next/server";
import { curateCatalog } from "@/lib/curator";
import { generateArticles } from "@/lib/content";

export const maxDuration = 300;

/**
 * Cron semanal: el agente añade productos nuevos al catálogo y redacta un
 * artículo de la revista (vercel.json).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const catalog = await curateCatalog();
  let content;
  try {
    content = await generateArticles(1);
  } catch (error) {
    content = {
      generated: 0,
      errors: [error instanceof Error ? error.message : "error"],
    };
  }
  return NextResponse.json({ catalog, content });
}
