import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/lib/db/schema";
import { deleteArticle, slugTaken, updateArticle } from "@/lib/articles";

type Params = { params: Promise<{ id: string }> };

/** Cadena vacía → null en los campos opcionales. */
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const patchSchema = z.object({
  title: z.string().trim().min(3).max(160),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
  excerpt: z.string().trim().max(400),
  body: z.string().trim().min(1).max(20000),
  category: z.enum(CATEGORIES),
  metaTitle: z.string().trim().min(3).max(70),
  metaDescription: z.string().trim().max(200),
  heroImageUrl: z.preprocess(emptyToNull, z.url().nullable()),
  heroImageAlt: z.preprocess(emptyToNull, z.string().trim().max(220).nullable()),
  productIds: z.array(z.uuid()).max(12),
  published: z.boolean(),
});

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }
  // El slug es la URL pública: no puede chocar con la de otro artículo.
  if (await slugTaken(parsed.data.slug, id)) {
    return NextResponse.json({ error: "Ya hay otro artículo con ese slug" }, { status: 409 });
  }
  try {
    const article = await updateArticle(id, parsed.data);
    if (!article) return NextResponse.json({ error: "No existe" }, { status: 404 });
    return NextResponse.json({ ok: true, slug: article.slug });
  } catch (error) {
    console.error("Error guardando artículo:", error);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const removed = await deleteArticle(id);
  if (!removed) return NextResponse.json({ error: "No existe" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
