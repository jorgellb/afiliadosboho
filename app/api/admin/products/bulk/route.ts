import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/lib/db/schema";
import { upsertProduct } from "@/lib/products";

export const maxDuration = 60;

const priceSchema = z
  .union([z.string(), z.number()])
  .transform((v) => Number(v))
  .refine((n) => Number.isFinite(n) && n > 0, "Precio inválido")
  .transform((n) => n.toFixed(2));

const itemSchema = z.object({
  sourceProductId: z.string().trim().min(1).max(100),
  title: z.string().trim().min(2).max(500),
  description: z.string().trim().max(2000).nullish(),
  imageUrl: z.url(),
  price: priceSchema,
  currency: z.string().trim().length(3).default("EUR"),
  originalPrice: priceSchema.nullish(),
  affiliateUrl: z.url(),
  productUrl: z.url().nullish(),
  category: z.enum(CATEGORIES).default("otros"),
  available: z.boolean().default(true),
});

const bodySchema = z.object({ items: z.array(itemSchema).min(1).max(20) });

/** Guarda de golpe los productos marcados en el buscador del panel. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Datos inválidos: ${parsed.error.issues[0]?.message ?? ""}` },
      { status: 400 }
    );
  }

  const saved: string[] = [];
  const failed: string[] = [];

  // Secuencial a propósito: el driver HTTP de Neon no gana nada en paralelo y
  // así un producto malo no tumba el lote entero.
  for (const item of parsed.data.items) {
    try {
      await upsertProduct(
        {
          source: "aliexpress",
          sourceProductId: item.sourceProductId,
          title: item.title,
          description: item.description ?? null,
          imageUrl: item.imageUrl,
          price: item.price,
          currency: item.currency.toUpperCase(),
          originalPrice: item.originalPrice ?? null,
          affiliateUrl: item.affiliateUrl,
          productUrl: item.productUrl ?? null,
          available: item.available,
          rating: null,
          ordersCount: null,
          discountPct: item.originalPrice
            ? Math.round((1 - Number(item.price) / Number(item.originalPrice)) * 100) || null
            : null,
        },
        { category: item.category, tags: ["buscador"] }
      );
      saved.push(item.sourceProductId);
    } catch (error) {
      console.error(`No se pudo guardar ${item.sourceProductId}:`, error);
      failed.push(item.sourceProductId);
    }
  }

  return NextResponse.json({ saved: saved.length, failed }, { status: 201 });
}
