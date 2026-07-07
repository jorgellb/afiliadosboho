import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { productTryonAssets, TryonAsset } from "@/lib/db/schema";
import { callNvidiaJson, NvidiaMessage } from "@/lib/nvidia";

export const maxDuration = 90;

const bodySchema = z.object({
  productId: z.string().trim().min(1).max(120),
  imageUrl: z.url(),
  title: z.string().trim().max(500).default(""),
  description: z.string().trim().max(2000).optional(),
});

interface Classification {
  category: "garment" | "accessory";
  subcategory: string;
  anchor_point: string | null;
  width_ratio: number | null;
  colors: string[];
  style_tags: string[];
  confidence: number;
}

const SYSTEM_PROMPT = `Eres un clasificador experto de productos de moda boho chic. Analiza la imagen y el título del producto y responde ÚNICAMENTE con JSON válido con esta estructura exacta: {"category": "garment"|"accessory", "subcategory": string (dress|kimono|top|skirt|pants|cardigan|earrings|necklace|bracelet|hat|glasses|headband|bag|belt|other), "anchor_point": "left_ear"|"neck"|"head"|"face"|null (solo accesorios que se llevan de cintura para arriba, null para ropa y bolsos), "width_ratio": number|null (proporción del accesorio respecto al ancho de una cara: pendientes 0.10, gafas 0.95, collar 0.45, sombrero 1.15, diadema 1.0, null para ropa), "colors": [máx 3 colores dominantes en español], "style_tags": [máx 4 etiquetas de estilo boho en español, ej: "étnico", "flecos", "crochet", "floral"], "confidence": number 0-1}. Sin texto adicional.`;

const ANCHORS = new Set(["left_ear", "right_ear", "neck", "head", "face"]);

function serialize(row: TryonAsset) {
  return {
    productId: row.productId,
    category: row.category,
    subcategory: row.subcategory,
    anchorPoint: row.anchorPoint,
    widthRatio: row.widthRatio,
    colors: row.colors ?? [],
    styleTags: row.styleTags ?? [],
    visionUsed: row.visionUsed,
    originalUrl: row.originalUrl,
    cleanUrl: row.cleanUrl,
    status: row.status,
  };
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { productId, imageUrl, title, description } = parsed.data;

  // 1. Caché: si ya está listo, no se vuelve a procesar NUNCA.
  const existing = await db
    .select()
    .from(productTryonAssets)
    .where(eq(productTryonAssets.productId, productId))
    .limit(1);
  if (existing[0]?.status === "ready") {
    return NextResponse.json({ asset: serialize(existing[0]), cached: true });
  }

  // 2. Marca en proceso (ON CONFLICT evita carreras entre peticiones).
  await db
    .insert(productTryonAssets)
    .values({ productId, originalUrl: imageUrl, status: "processing" })
    .onConflictDoUpdate({
      target: productTryonAssets.productId,
      set: { status: "processing", originalUrl: imageUrl },
    });

  try {
    // 3. Clasificación multimodal (imagen + título).
    const messages: NvidiaMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Título: ${title}\n${description ? `Descripción: ${description}` : ""}`.trim(),
          },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ];
    const { data, visionUsed } = await callNvidiaJson<Classification>(messages, {
      needsVision: true,
      label: "clasificar",
      maxTokens: 400,
    });

    const category = data.category === "garment" ? "garment" : "accessory";
    const anchorPoint =
      data.anchor_point && ANCHORS.has(data.anchor_point) ? data.anchor_point : null;
    const widthRatio =
      typeof data.width_ratio === "number" && data.width_ratio > 0
        ? data.width_ratio
        : null;

    const [row] = await db
      .update(productTryonAssets)
      .set({
        category,
        subcategory: (data.subcategory || "other").slice(0, 40),
        anchorPoint,
        widthRatio,
        colors: (data.colors ?? []).slice(0, 3),
        styleTags: (data.style_tags ?? []).slice(0, 4),
        visionUsed,
        status: "ready",
        errorMsg: null,
        processedAt: sql`now()`,
      })
      .where(eq(productTryonAssets.productId, productId))
      .returning();

    return NextResponse.json({ asset: serialize(row), cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    console.error("Error preparando producto para el probador:", message);
    await db
      .update(productTryonAssets)
      .set({ status: "failed", errorMsg: message.slice(0, 300) })
      .where(eq(productTryonAssets.productId, productId));
    return NextResponse.json(
      { error: "No se pudo preparar la pieza. Inténtalo de nuevo en un momento." },
      { status: 500 }
    );
  }
}
