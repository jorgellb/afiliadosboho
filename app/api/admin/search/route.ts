import { NextResponse } from "next/server";
import { z } from "zod";
import { ProviderError, getProvider } from "@/lib/providers";
import { getSavedSourceIds } from "@/lib/products";

export const maxDuration = 30;

const querySchema = z
  .object({
    q: z.string().trim().min(2).max(200),
    page: z.coerce.number().int().min(1).max(10).default(1),
    min: z.coerce.number().min(0).max(100000).optional(),
    max: z.coerce.number().min(0).max(100000).optional(),
    sort: z.enum(["relevancia", "precio_asc", "precio_desc", "ventas"]).default("relevancia"),
  })
  .refine((v) => v.min === undefined || v.max === undefined || v.min <= v.max, {
    message: "El precio mínimo no puede superar al máximo",
  });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q"),
    page: searchParams.get("page") ?? undefined,
    min: searchParams.get("min") || undefined,
    max: searchParams.get("max") || undefined,
    sort: searchParams.get("sort") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" },
      { status: 400 }
    );
  }
  const { q, page, min, max, sort } = parsed.data;

  try {
    const [results, savedIds] = await Promise.all([
      getProvider("aliexpress").search(q, page, {
        minPrice: min,
        maxPrice: max,
        sort,
      }),
      getSavedSourceIds("aliexpress"),
    ]);
    return NextResponse.json({
      results: results.map((r) => ({
        ...r,
        alreadySaved: savedIds.has(r.sourceProductId),
      })),
      // Con filtro de precio la página puede traer menos de 20: AliExpress lo
      // aplica sobre su propio precio y aquí se depura sobre el precio en euros.
      filtered: min !== undefined || max !== undefined,
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof Error && error.message.startsWith("Falta la variable de entorno")) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("Error en búsqueda admin:", error);
    return NextResponse.json(
      { error: "Error inesperado consultando AliExpress" },
      { status: 500 }
    );
  }
}
