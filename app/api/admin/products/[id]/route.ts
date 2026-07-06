import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/lib/db/schema";
import {
  ProductPatch,
  deleteProduct,
  getProductById,
  updateProduct,
} from "@/lib/products";

const priceSchema = z
  .union([z.string(), z.number()])
  .transform((v) => Number(v))
  .refine((n) => Number.isFinite(n) && n > 0, "Precio inválido")
  .transform((n) => n.toFixed(2));

/** Todos los campos del producto son editables desde el panel. */
const patchSchema = z
  .object({
    title: z.string().trim().min(2).max(500),
    description: z.string().trim().max(2000).nullable(),
    imageUrl: z.url(),
    affiliateUrl: z.url(),
    productUrl: z.url().nullable(),
    price: priceSchema,
    originalPrice: priceSchema.nullable(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((s) => s.toUpperCase()),
    category: z.enum(CATEGORIES),
    tags: z.array(z.string().trim().min(1).max(50)).max(20),
    available: z.boolean(),
    isActive: z.boolean(),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones")
      .nullable(),
    seoTitle: z.string().trim().min(3).max(120).nullable(),
    seoDescription: z.string().trim().max(2000).nullable(),
    metaTitle: z.string().trim().min(3).max(70).nullable(),
    metaDescription: z.string().trim().min(20).max(170).nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, "Sin campos que actualizar");

const idSchema = z.uuid();

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: `Datos inválidos${issue ? `: ${issue.path.join(".")} — ${issue.message}` : ""}` },
      { status: 400 }
    );
  }
  try {
    const product = await updateProduct(id, parsed.data as ProductPatch);
    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof Error && error.message.includes("products_slug_idx")) {
      return NextResponse.json(
        { error: "Ese slug ya lo usa otro producto" },
        { status: 409 }
      );
    }
    console.error("Error actualizando producto:", error);
    return NextResponse.json(
      { error: "No se pudo actualizar el producto" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }
  const existing = await getProductById(id);
  if (!existing) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }
  await deleteProduct(id);
  return NextResponse.json({ ok: true });
}
