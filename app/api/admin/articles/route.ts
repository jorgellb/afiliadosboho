import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@/lib/db/schema";
import { createArticle, uniqueSlug } from "@/lib/articles";

const bodySchema = z.object({
  title: z.string().trim().min(3).max(160),
  category: z.enum(CATEGORIES).default("otros"),
});

/** Crea un borrador vacío y devuelve su id para abrir el editor. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Escribe un título de al menos 3 caracteres" }, { status: 400 });
  }
  const { title, category } = parsed.data;
  try {
    const article = await createArticle({
      slug: await uniqueSlug(title),
      title,
      metaTitle: title.slice(0, 60),
      metaDescription: "",
      excerpt: "",
      body: `## Empieza por aquí\n\nEscribe el primer párrafo.`,
      category,
      heroImageUrl: null,
      heroImageAlt: null,
      productIds: [],
      // Nace como borrador: nada se publica sin querer.
      published: false,
    });
    return NextResponse.json({ id: article.id, slug: article.slug });
  } catch (error) {
    console.error("Error creando artículo:", error);
    return NextResponse.json({ error: "No se pudo crear el artículo" }, { status: 500 });
  }
}
