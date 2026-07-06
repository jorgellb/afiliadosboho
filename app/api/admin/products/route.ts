import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES, SOURCES } from "@/lib/db/schema";
import { upsertProduct } from "@/lib/products";

const priceSchema = z
  .union([z.string(), z.number()])
  .transform((v) => Number(v))
  .refine((n) => Number.isFinite(n) && n > 0, "Precio inválido")
  .transform((n) => n.toFixed(2));

const bodySchema = z.object({
  source: z.enum(SOURCES),
  sourceProductId: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(2).max(500),
  description: z.string().trim().max(2000).nullish(),
  imageUrl: z.url(),
  price: priceSchema,
  currency: z.string().trim().length(3).default("USD"),
  originalPrice: priceSchema.nullish(),
  affiliateUrl: z.url(),
  productUrl: z.url().nullish(),
  category: z.enum(CATEGORIES).default("otros"),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  available: z.boolean().default(true),
});

/** Deriva el ID de origen desde la URL del item de AliExpress. */
function deriveSourceProductId(urls: (string | null | undefined)[]): string {
  for (const url of urls) {
    if (!url) continue;
    const match = url.match(/\/item\/(\d+)\.html/);
    if (match) return match[1];
  }
  // Alta manual sin ID reconocible: ID estable derivado de la URL.
  return `manual-${createHash("sha256").update(urls[0] ?? "").digest("hex").slice(0, 16)}`;
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Datos inválidos: ${parsed.error.issues[0]?.message ?? ""}` },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const sourceProductId =
    data.sourceProductId ??
    deriveSourceProductId([data.productUrl, data.affiliateUrl]);

  try {
    const product = await upsertProduct(
      {
        source: data.source,
        sourceProductId,
        title: data.title,
        description: data.description ?? null,
        imageUrl: data.imageUrl,
        price: data.price,
        currency: data.currency.toUpperCase(),
        originalPrice: data.originalPrice ?? null,
        affiliateUrl: data.affiliateUrl,
        productUrl: data.productUrl ?? null,
        available: data.available,
      },
      { category: data.category, tags: data.tags }
    );
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    console.error("Error guardando producto:", error);
    return NextResponse.json(
      { error: "No se pudo guardar el producto" },
      { status: 500 }
    );
  }
}
