import { NextResponse } from "next/server";
import { z } from "zod";
import { callModel } from "@/lib/assistant";
import { getArticleById } from "@/lib/articles";

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["meta", "alt", "excerpt"]),
});

/** Extrae el JSON aunque el modelo lo envuelva en ``` o en texto. */
function parseJson<T>(content: string): T {
  const clean = content.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  return JSON.parse(start !== -1 ? clean.slice(start, end + 1) : clean) as T;
}

/** Asistencia puntual de la IA sobre un artículo ya escrito. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Acción inválida" }, { status: 400 });

  const article = await getArticleById(id);
  if (!article) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const contexto = `Título: ${article.title}
Categoría: ${article.category}
Extracto actual: ${article.excerpt || "(vacío)"}
Cuerpo (recortado): ${article.body.slice(0, 2500)}`;

  const prompts: Record<string, string> = {
    meta: `Eres la editora SEO de la tienda de moda boho "Boho Chic".

${contexto}

Escribe el meta title y la meta description de este artículo para Google. Nada de relleno ni de clichés de IA.
Responde SOLO este JSON:
{"meta_title": "≤60 caracteres, con la palabra clave principal, termina en ' | Boho Chic'", "meta_description": "entre 140 y 155 caracteres, con gancho y llamada a la acción, sin comillas dobles"}`,

    excerpt: `Eres Lucía, la redactora del "Diario boho" de Boho Chic.

${contexto}

Escribe un extracto de una sola frase (15-25 palabras) con voz propia, que dé ganas de leer el artículo. Sin clichés.
Responde SOLO este JSON: {"excerpt": "..."}`,

    alt: `Eres experta en accesibilidad y SEO de imágenes.

${contexto}

Escribe el texto alternativo (atributo alt) de la imagen destacada. Describe lo que se ve, entre 8 y 16 palabras, sin empezar por "imagen de" ni "foto de", y sin repetir literalmente el título.
Responde SOLO este JSON: {"alt": "..."}`,
  };

  try {
    const message = await callModel([{ role: "user", content: prompts[parsed.data.action] }], {
      maxTokens: 500,
    });
    const data = parseJson<Record<string, string>>(message.content ?? "");

    if (parsed.data.action === "meta") {
      if (!data.meta_title || !data.meta_description) throw new Error("respuesta incompleta");
      return NextResponse.json({
        metaTitle: data.meta_title.trim().slice(0, 70),
        metaDescription: data.meta_description.trim().slice(0, 200),
      });
    }
    if (parsed.data.action === "excerpt") {
      if (!data.excerpt) throw new Error("respuesta incompleta");
      return NextResponse.json({ excerpt: data.excerpt.trim().slice(0, 400) });
    }
    if (!data.alt) throw new Error("respuesta incompleta");
    return NextResponse.json({ heroImageAlt: data.alt.trim().slice(0, 220) });
  } catch (error) {
    console.error("Error de la IA en el artículo:", error);
    return NextResponse.json(
      { error: "La IA no respondió bien. Prueba otra vez en un momento." },
      { status: 502 }
    );
  }
}
