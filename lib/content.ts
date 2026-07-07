import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  Article,
  Category,
  NewArticle,
  Product,
  articles,
  products,
} from "@/lib/db/schema";
import { callModel } from "@/lib/assistant";
import { slugify } from "@/lib/seo";
import { bumpCacheVersion } from "@/lib/cache";

/**
 * Motor de contenido SEO: la IA redacta artículos editoriales de moda boho
 * que posicionan en Google y enlazan a las piezas de la tienda. Se dispara
 * desde el panel admin o el cron semanal.
 */

interface Topic {
  title: string;
  category: Category;
  keyword: string;
}

const TOPICS: Topic[] = [
  { title: "Cómo combinar un kimono boho en 5 looks", category: "kimonos", keyword: "kimono boho" },
  { title: "Vestidos boho para una boda en la playa", category: "vestidos", keyword: "vestido boho boda playa" },
  { title: "Guía de faldas boho: vuelo, largo y estampados", category: "faldas", keyword: "falda boho larga" },
  { title: "Accesorios boho que transforman cualquier look", category: "accesorios", keyword: "accesorios boho" },
  { title: "Bolsos de crochet y flecos: el toque boho definitivo", category: "bolsos", keyword: "bolso boho crochet" },
  { title: "Sandalias y calzado boho para el verano", category: "calzado", keyword: "sandalias boho" },
  { title: "Joyería boho: capas, conchas y metales cálidos", category: "joyeria", keyword: "joyeria boho" },
  { title: "Blusas bordadas: el básico boho de entretiempo", category: "blusas", keyword: "blusa boho bordada" },
  { title: "Pantalones anchos boho: comodidad con estilo", category: "pantalones", keyword: "pantalon boho ancho" },
  { title: "Tendencias boho chic 2026", category: "vestidos", keyword: "tendencias boho 2026" },
];

export interface ContentSummary {
  generated: number;
  errors: string[];
}

interface ArticleCopy {
  meta_title: string;
  meta_description: string;
  excerpt: string;
  body: string;
}

async function writeArticle(topic: Topic, featured: Product[]): Promise<ArticleCopy> {
  const piezas = featured
    .map((p) => `- ${p.seoTitle ?? p.title} (${p.price} ${p.currency})`)
    .join("\n");
  const message = await callModel(
    [
      {
        role: "user",
        content: `Eres redactora de moda de "Boho Chic". Escribe un artículo editorial en español, SEO, sobre "${topic.title}" (palabra clave: ${topic.keyword}).

Requisitos del cuerpo (markdown ligero):
- 350-500 palabras, tono cercano y experto, nada de relleno.
- 2 o 3 secciones con encabezado "## ".
- Consejos concretos de cómo combinar, tejidos, ocasiones y accesorios.
- Puedes mencionar de forma natural piezas de esta lista, pero SIN inventar enlaces ni precios (los enlaces los añadimos nosotros):
${piezas || "(sin piezas destacadas)"}
- No menciones AliExpress, proveedores ni comisiones.

Responde SOLO con este JSON, sin texto extra:
{
  "meta_title": "≤60 caracteres, con la palabra clave, termina en ' | Boho Chic'",
  "meta_description": "140-155 caracteres con gancho y llamada a la acción",
  "excerpt": "1 frase de 15-25 palabras que resuma el artículo",
  "body": "el artículo en markdown con encabezados ##"
}`,
      },
    ],
    { maxTokens: 4096 }
  );
  const raw = (message.content ?? "").replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(raw) as Partial<ArticleCopy>;
  if (!parsed.meta_title || !parsed.meta_description || !parsed.excerpt || !parsed.body) {
    throw new Error("artículo incompleto");
  }
  return {
    meta_title: parsed.meta_title.trim().slice(0, 70),
    meta_description: parsed.meta_description.trim().slice(0, 170),
    excerpt: parsed.excerpt.trim().slice(0, 300),
    body: parsed.body.trim().slice(0, 8000),
  };
}

/** Genera artículos para los temas que aún no existen (uno o varios). */
export async function generateArticles(limit: number = 1): Promise<ContentSummary> {
  const existing = await db.select({ slug: articles.slug }).from(articles);
  const existingSlugs = new Set(existing.map((a) => a.slug));
  const pending = TOPICS.filter((t) => !existingSlugs.has(slugify(t.title))).slice(
    0,
    Math.max(1, limit)
  );

  const summary: ContentSummary = { generated: 0, errors: [] };
  for (const topic of pending) {
    try {
      const featured = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.category, topic.category),
            eq(products.isActive, true),
            eq(products.available, true)
          )
        )
        .orderBy(desc(products.clicks), desc(products.createdAt))
        .limit(6);

      const copy = await writeArticle(topic, featured);
      const value: NewArticle = {
        slug: slugify(topic.title),
        title: topic.title,
        metaTitle: copy.meta_title,
        metaDescription: copy.meta_description,
        excerpt: copy.excerpt,
        body: copy.body,
        category: topic.category,
        heroImageUrl: featured[0]?.imageUrl ?? null,
        productIds: featured.map((p) => p.id),
      };
      await db.insert(articles).values(value).onConflictDoNothing();
      summary.generated++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "error";
      summary.errors.push(`${topic.title}: ${message}`);
      if (message.includes("429")) break; // límite de la IA: no insistir
    }
  }
  if (summary.generated > 0) await bumpCacheVersion();
  return summary;
}

export async function getPublishedArticles(): Promise<Article[]> {
  return db
    .select()
    .from(articles)
    .where(eq(articles.published, true))
    .orderBy(desc(articles.createdAt));
}

export async function getArticleBySlug(slug: string): Promise<Article | undefined> {
  const rows = await db.select().from(articles).where(eq(articles.slug, slug)).limit(1);
  return rows[0];
}

export async function getArticleProducts(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.isActive, true)));
  // Conserva el orden de productIds.
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((p): p is Product => p !== undefined);
}
