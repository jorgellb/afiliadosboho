import { NextResponse } from "next/server";
import { z } from "zod";
import { computeResult, PROFILES, QUESTIONS } from "@/lib/quiz";
import { getProductsByProfile } from "@/lib/products";

const bodySchema = z.object({
  answers: z
    .array(z.number().int().min(0).max(3))
    .length(QUESTIONS.length),
});

/** Calcula el perfil de estilo y devuelve un feed personalizado. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Respuestas inválidas" }, { status: 400 });
  }
  const result = computeResult(parsed.data.answers);
  const products = await getProductsByProfile(result.categories, result.maxPrice);

  return NextResponse.json({
    profile: result.profile,
    name: PROFILES[result.profile].name,
    tagline: PROFILES[result.profile].tagline,
    products: products.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.seoTitle ?? p.title,
      price: p.price,
      currency: p.currency,
      originalPrice: p.originalPrice,
      imageUrl: p.imageUrl,
      discountPct: p.discountPct,
      rating: p.rating,
      ordersCount: p.ordersCount,
    })),
  });
}
