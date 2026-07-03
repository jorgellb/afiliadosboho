import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/lib/db/schema";
import { curateCatalog } from "@/lib/curator";

export const maxDuration = 120;

const bodySchema = z
  .object({
    categories: z.array(z.enum(CATEGORIES)).min(1).optional(),
    perCategory: z.number().int().min(1).max(6).optional(),
  })
  .optional();

/** El agente rellena el catálogo por categorías (botón del dashboard). */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(
    await request.json().catch(() => undefined)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }
  try {
    const summary = await curateCatalog(parsed.data ?? {});
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Error en el curador:", error);
    return NextResponse.json(
      { error: "No se pudo completar la curación del catálogo" },
      { status: 500 }
    );
  }
}
