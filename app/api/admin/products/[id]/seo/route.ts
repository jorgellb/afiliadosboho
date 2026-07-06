import { NextResponse } from "next/server";
import { z } from "zod";
import { getProductById } from "@/lib/products";
import { generateSeoForProduct } from "@/lib/seo";
import { bumpCacheVersion } from "@/lib/cache";

export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** (Re)genera la ficha SEO de un producto concreto con el agente. */
export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  const product = await getProductById(id);
  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }
  try {
    await generateSeoForProduct(product);
    await bumpCacheVersion();
    const refreshed = await getProductById(id);
    return NextResponse.json({ product: refreshed });
  } catch (error) {
    console.error("Error regenerando ficha SEO:", error);
    const message =
      error instanceof Error && error.message.includes("429")
        ? "La IA está saturada (límite de peticiones); espera un minuto y reintenta."
        : "No se pudo generar la ficha; reintenta en un momento.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
