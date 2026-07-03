import { NextResponse } from "next/server";
import { z } from "zod";
import { getProductById, incrementClicks } from "@/lib/products";

/** Redirige al enlace de afiliado contando el clic. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.redirect(new URL("/", _request.url));
  }
  const product = await getProductById(id);
  if (!product) {
    return NextResponse.redirect(new URL("/", _request.url));
  }
  // El contador no debe bloquear ni romper la redirección.
  try {
    await incrementClicks(id);
  } catch (error) {
    console.error("Error incrementando clics:", error);
  }
  return NextResponse.redirect(product.affiliateUrl, 302);
}
