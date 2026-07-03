import { NextResponse } from "next/server";
import { z } from "zod";
import { SOURCES } from "@/lib/db/schema";
import { ProviderError, getProvider } from "@/lib/providers";
import { getSavedSourceIds } from "@/lib/products";

const querySchema = z.object({
  source: z.enum(SOURCES),
  q: z.string().trim().min(2).max(200),
  page: z.coerce.number().int().min(1).max(10).default(1),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    source: searchParams.get("source"),
    q: searchParams.get("q"),
    page: searchParams.get("page") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros inválidos: se requiere source (amazon|aliexpress) y q (mín. 2 caracteres)" },
      { status: 400 }
    );
  }
  const { source, q, page } = parsed.data;

  try {
    const [results, savedIds] = await Promise.all([
      getProvider(source).search(q, page),
      getSavedSourceIds(source),
    ]);
    return NextResponse.json({
      results: results.map((r) => ({
        ...r,
        alreadySaved: savedIds.has(r.sourceProductId),
      })),
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
      { error: "Error inesperado consultando el proveedor" },
      { status: 500 }
    );
  }
}
