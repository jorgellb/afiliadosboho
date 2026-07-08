import { NextResponse } from "next/server";
import { embedBatch } from "@/lib/find-look";

// Máximo permitido en Vercel Hobby.
export const maxDuration = 60;

/**
 * Indexa un lote pequeño y reanudable del catálogo (Módulo A). Protegido con
 * x-api-key = INTERNAL_API_KEY. 15 productos ≈ 30 llamadas a NIM: cabe en el
 * rate limit de 1 minuto y en el timeout de Hobby.
 */
export async function POST(request: Request) {
  const secret = process.env.INTERNAL_API_KEY;
  if (!secret || request.headers.get("x-api-key") !== secret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    // Lote configurable; por defecto 10 para caber con holgura en el timeout de
    // Hobby (~60s) incluso si algún producto cae al modelo de visión lento.
    const size = Number(process.env.EMBED_BATCH_SIZE || 10);
    const summary = await embedBatch(size);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Error en embed-batch:", error);
    return NextResponse.json(
      { error: "Fallo en el lote de indexación" },
      { status: 500 }
    );
  }
}
