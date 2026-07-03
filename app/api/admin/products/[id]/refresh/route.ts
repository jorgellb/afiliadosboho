import { NextResponse } from "next/server";
import { z } from "zod";
import { ProviderError, getProvider } from "@/lib/providers";
import { applyPriceRefresh, getProductById } from "@/lib/products";
import { bumpCacheVersion } from "@/lib/cache";

type Context = { params: Promise<{ id: string }> };

/** Re-consulta el precio y disponibilidad de un producto en su API de origen. */
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
    const fetched = await getProvider(product.source).getByIds([
      product.sourceProductId,
    ]);
    const summary = await applyPriceRefresh([product], fetched);
    await bumpCacheVersion();
    const refreshed = await getProductById(id);
    return NextResponse.json({ product: refreshed, ...summary });
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("Error refrescando producto:", error);
    return NextResponse.json(
      { error: "Error inesperado consultando el proveedor" },
      { status: 500 }
    );
  }
}
