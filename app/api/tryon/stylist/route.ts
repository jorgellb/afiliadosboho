import { NextResponse } from "next/server";
import { z } from "zod";
import { getComplementaryProducts, getProductById } from "@/lib/products";
import { callNvidiaJson } from "@/lib/nvidia";

export const maxDuration = 60;

interface Suggestion {
  product_id: string;
  reason: string;
}

/**
 * Estilista IA (Módulo D): tras probarse una pieza, sugiere 3 complementos
 * reales del catálogo con una razón cálida. Sin persistencia (fase gratuita).
 */
export async function GET(request: Request) {
  const productId = new URL(request.url).searchParams.get("productId") ?? "";
  if (!z.uuid().safeParse(productId).success) {
    return NextResponse.json({ error: "productId inválido" }, { status: 400 });
  }
  const product = await getProductById(productId);
  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const candidates = await getComplementaryProducts(product, 30);
  if (candidates.length === 0) return NextResponse.json({ suggestions: [] });

  const candidateList = candidates.map((c) => ({
    product_id: c.id,
    titulo: c.seoTitle ?? c.title,
    colores: [],
    etiquetas: c.tags,
  }));

  try {
    const { data } = await callNvidiaJson<{ suggestions: Suggestion[] }>(
      [
        {
          role: "user",
          content: `Eres una estilista experta en moda boho chic, cercana y con criterio. El usuario acaba de probarse virtualmente: "${product.seoTitle ?? product.title}" (categoría ${product.category}). De esta lista de productos candidatos: ${JSON.stringify(candidateList)}, elige EXACTAMENTE 3 que combinen de verdad con lo probado. Responde ÚNICAMENTE con JSON: {"suggestions": [{"product_id": string, "reason": string (máx 15 palabras, en español, tono cálido de estilista, menciona por qué combina)}]}. No inventes IDs que no estén en la lista. No menciones tiendas ni proveedores.`,
        },
      ],
      { label: "estilista", maxTokens: 500, needsVision: false }
    );

    // Anti-alucinación: solo IDs que existen en la lista candidata.
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const suggestions = (data.suggestions ?? [])
      .filter((s) => byId.has(s.product_id))
      .slice(0, 3)
      .map((s) => {
        const p = byId.get(s.product_id)!;
        return {
          id: p.id,
          slug: p.slug,
          title: p.seoTitle ?? p.title,
          price: p.price,
          currency: p.currency,
          imageUrl: p.imageUrl,
          reason: s.reason?.slice(0, 120) ?? "",
        };
      });

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Error en la estilista del probador:", error);
    // Degradado: si la IA falla, devolvemos complementos por popularidad.
    const suggestions = candidates.slice(0, 3).map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.seoTitle ?? p.title,
      price: p.price,
      currency: p.currency,
      imageUrl: p.imageUrl,
      reason: "Combina con tu estilo boho.",
    }));
    return NextResponse.json({ suggestions });
  }
}
