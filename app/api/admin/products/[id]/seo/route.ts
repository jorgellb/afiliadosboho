import { NextResponse } from "next/server";
import { z } from "zod";
import { getProductById } from "@/lib/products";
import { generateSeoForProduct, generateTagsForProduct } from "@/lib/seo";
import { bumpCacheVersion } from "@/lib/cache";

export const maxDuration = 60;

const bodySchema = z
  .object({
    mode: z.enum(["full", "tags"]).default("full"),
    keyword: z.string().trim().max(80).optional(),
  })
  .default({ mode: "full" });

type Context = { params: Promise<{ id: string }> };

/** (Re)genera la ficha SEO de un producto, o solo sus tags, con el agente. */
export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const product = await getProductById(id);
  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }
  try {
    if (parsed.data.mode === "tags") {
      const tags = await generateTagsForProduct(product);
      return NextResponse.json({ tags });
    }
    await generateSeoForProduct(product, { keyword: parsed.data.keyword });
    await bumpCacheVersion();
    const refreshed = await getProductById(id);
    return NextResponse.json({ product: refreshed });
  } catch (error) {
    console.error("Error regenerando SEO:", error);
    const message =
      error instanceof Error && error.message.includes("429")
        ? "La IA está saturada (límite de peticiones); espera un minuto y reintenta."
        : "No se pudo generar; reintenta en un momento.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
