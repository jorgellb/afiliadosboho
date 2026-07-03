import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/lib/db/schema";
import { deleteProduct, getProductById, updateProduct } from "@/lib/products";

const patchSchema = z
  .object({
    category: z.enum(CATEGORIES),
    tags: z.array(z.string().trim().min(1).max(50)).max(20),
    isActive: z.boolean(),
    title: z.string().trim().min(2).max(500),
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
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const product = await updateProduct(id, parsed.data);
  if (!product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ product });
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
