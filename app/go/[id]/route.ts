import { NextResponse } from "next/server";
import { z } from "zod";
import { getProductById, recordClick } from "@/lib/products";

/**
 * Añade un sub-ID de afiliado al enlace de salida para atribuir la venta a la
 * página/canal de origen en el panel de AliExpress. El nombre del parámetro es
 * configurable porque varía según la versión del portal; por defecto `aff_fsk`
 * (el que usan los enlaces s.click). Si no se define, no se toca la URL.
 */
function withSubId(url: string, source: string, productId: string): string {
  const param = process.env.ALIEXPRESS_SUBID_PARAM;
  if (!param) return url;
  const subId = `${source}_${productId.slice(0, 8)}`.replace(/[^a-zA-Z0-9_]/g, "");
  try {
    const u = new URL(url);
    u.searchParams.set(param, subId);
    return u.toString();
  } catch {
    return url;
  }
}

/** Redirige al enlace de afiliado contando el clic y su fuente. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const product = await getProductById(id);
  if (!product) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Fuente del clic: ?src=ficha|look|quiz|home|chat… (para atribución interna).
  const src = new URL(request.url).searchParams.get("src")?.slice(0, 40) || "directo";
  // El registro no debe bloquear ni romper la redirección.
  try {
    await recordClick(id, src);
  } catch (error) {
    console.error("Error registrando clic:", error);
  }

  return NextResponse.redirect(withSubId(product.affiliateUrl, src, id), 302);
}
