import { and, desc, eq, inArray, ne } from "drizzle-orm";
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
import { collectionHref } from "@/lib/collections";

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
  // Temas nuevos (2026-07): van primero para que se generen antes.
  { title: "Boho en la ciudad: 5 looks urbanos con alma bohemia", category: "vestidos", keyword: "boho urbano" },
  { title: "Vestidos midi boho: el largo más favorecedor del verano", category: "vestidos", keyword: "vestido midi boho" },
  { title: "El arte de las capas: collares y joyas boho superpuestas", category: "joyeria", keyword: "collares boho capas" },
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

// Auto-enlazado interno: la primera mención de cada categoría en el cuerpo se
// convierte en enlace a su página (SEO), sin depender de que la IA lo haga.
const CATEGORY_PATTERNS: Array<[RegExp, Category]> = [
  [/\bvestidos?\b/i, "vestidos"],
  [/\bkimonos?\b/i, "kimonos"],
  [/\bfaldas?\b/i, "faldas"],
  [/\bblusas?\b/i, "blusas"],
  [/\bpantalones?\b/i, "pantalones"],
  [/\bbolsos?\b/i, "bolsos"],
  [/\b(sandalias?|calzado|zapatos?|botas?)\b/i, "calzado"],
  [/\b(joyer[íi]a|collar(?:es)?|pendientes?|pulseras?)\b/i, "joyeria"],
  [/\b(accesorios?|sombreros?|cintur(?:ón|on)(?:es)?)\b/i, "accesorios"],
];

/**
 * Convierte la primera mención de cada categoría (fuera de encabezados) en un
 * enlace interno a su página. Máximo 4 enlaces para no sobre-enlazar.
 *
 * Apunta a la URL de COLECCIÓN (/vestidos-boho), no al viejo parámetro
 * `/?category=vestidos`: ese ahora responde con un 301 y enlazar internamente
 * a un redirect desperdicia el enlace y añade un salto en cada visita. Como
 * esto se aplica al renderizar y no al guardar, arreglarlo aquí corrige de
 * golpe todos los artículos ya publicados.
 */
export function linkifyCategories(body: string): string {
  const used = new Set<Category>();
  let added = 0;
  return body
    .split("\n")
    .map((line) => {
      if (line.startsWith("#") || added >= 4) return line;
      let out = line;
      for (const [re, cat] of CATEGORY_PATTERNS) {
        if (used.has(cat) || added >= 4) continue;
        if (re.test(out)) {
          out = out.replace(re, (m) => `[${m}](${collectionHref(cat)})`);
          used.add(cat);
          added++;
        }
      }
      return out;
    })
    .join("\n");
}

/** Otros artículos publicados para enlazar (prioriza la misma categoría). */
export async function getRelatedArticles(
  excludeSlug: string,
  category: Category,
  limit = 3
): Promise<Article[]> {
  const rows = await db
    .select()
    .from(articles)
    .where(and(eq(articles.published, true), ne(articles.slug, excludeSlug)))
    .orderBy(desc(articles.createdAt))
    .limit(12);
  const sameCat = rows.filter((r) => r.category === category);
  const others = rows.filter((r) => r.category !== category);
  return [...sameCat, ...others].slice(0, limit);
}

/**
 * Artículos publicados de una categoría, para enlazar desde su colección.
 *
 * Cierra el circuito que pedía el plan: la colección manda tráfico al
 * artículo y el artículo devuelve a la colección y a las fichas. Sin esto la
 * revista queda como un silo al que solo se llega desde su propio índice.
 */
export async function getArticlesForCategory(
  category: Category,
  limit = 3
): Promise<Article[]> {
  return db
    .select()
    .from(articles)
    .where(and(eq(articles.published, true), eq(articles.category, category)))
    .orderBy(desc(articles.createdAt))
    .limit(limit);
}

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

/** Extrae y parsea el JSON del artículo; repara una vez si viene malformado. */
async function parseArticleJson(content: string): Promise<Partial<ArticleCopy>> {
  const extract = (s: string) => {
    const clean = s.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    return start !== -1 && end !== -1 ? clean.slice(start, end + 1) : clean;
  };
  try {
    return JSON.parse(extract(content)) as Partial<ArticleCopy>;
  } catch {
    // El modelo a veces deja comillas o saltos sin escapar: se le pide corregir.
    const repair = await callModel(
      [
        {
          role: "user",
          content: `Corrige y devuelve SOLO este JSON válido, escapando bien las comillas y los saltos de línea internos, sin cambiar el contenido:\n${extract(content).slice(0, 6000)}`,
        },
      ],
      { maxTokens: 4096 }
    );
    return JSON.parse(extract(repair.content ?? "")) as Partial<ArticleCopy>;
  }
}

async function writeArticle(topic: Topic, featured: Product[]): Promise<ArticleCopy> {
  const piezas = featured
    .map((p) => `- ${p.seoTitle ?? p.title} (${p.price} ${p.currency})`)
    .join("\n");
  const message = await callModel(
    [
      {
        role: "user",
        content: `Eres Lucía, estilista y redactora del "Diario boho" de la tienda Boho Chic. Escribes como una amiga con criterio: cercana, con voz propia y opiniones, nada robótica.

Escribe un artículo para el blog sobre "${topic.title}" (palabra clave a posicionar en Google: ${topic.keyword}).

Voz y estilo (MUY humano, esto es lo importante):
- Habla en primera persona (yo/nosotras) e incluye alguna preferencia o pequeña anécdota real ("mi truco cuando aprieta el calor…", "reconozco que soy team…").
- Ritmo variado en las frases, transiciones naturales, algún detalle sensorial (el tacto del lino, la luz de la tarde, el sonido de los flecos).
- Consejos concretos y accionables: cómo combinar, qué tejidos, para qué ocasión, colores y accesorios.
- EVITA clichés de IA ("en el mundo de la moda", "sin duda", "en resumen", "en conclusión") y el relleno. Nada de listas de puntos genéricas y frías.
- 450-650 palabras. Exactamente 3 secciones con encabezado "## ". Puedes usar como mucho una lista corta.
- Menciona con naturalidad, por su nombre, algunas de estas piezas (sin inventar precios ni datos técnicos):
${piezas || "(sin piezas destacadas)"}
- No menciones AliExpress, proveedores, envíos ni comisiones.

Responde SOLO con este JSON válido, sin texto extra:
{
  "meta_title": "≤60 caracteres, con la palabra clave, termina en ' | Boho Chic'",
  "meta_description": "140-155 caracteres, con gancho y llamada a la acción; sin comillas dobles",
  "excerpt": "1 frase con voz propia de 15-25 palabras que dé ganas de leer",
  "body": "el artículo en markdown con 3 encabezados ##"
}`,
      },
    ],
    { maxTokens: 4096 }
  );
  const parsed = await parseArticleJson(message.content ?? "");
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
  const existing = await db
    .select({ slug: articles.slug, productIds: articles.productIds, hero: articles.heroImageUrl })
    .from(articles);
  const existingSlugs = new Set(existing.map((a) => a.slug));
  // Para no repetir piezas ni imágenes: se parte de lo ya usado por otros posts.
  const usedProducts = new Set<string>(existing.flatMap((a) => a.productIds));
  const usedHeroes = new Set<string>(
    existing.map((a) => a.hero).filter((h): h is string => h !== null)
  );

  const pending = TOPICS.filter((t) => !existingSlugs.has(slugify(t.title))).slice(
    0,
    Math.max(1, limit)
  );

  const summary: ContentSummary = { generated: 0, errors: [] };
  for (const topic of pending) {
    try {
      const candidates = await db
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
        .limit(40);
      // Prioriza piezas aún no usadas por otros artículos; rellena si faltan.
      const fresh = candidates.filter((p) => !usedProducts.has(p.id));
      const featured = [...fresh, ...candidates.filter((p) => usedProducts.has(p.id))].slice(0, 6);
      featured.forEach((p) => usedProducts.add(p.id));
      const hero = featured.find((p) => !usedHeroes.has(p.imageUrl)) ?? featured[0];
      if (hero) usedHeroes.add(hero.imageUrl);

      const copy = await writeArticle(topic, featured);
      const value: NewArticle = {
        slug: slugify(topic.title),
        title: topic.title,
        metaTitle: copy.meta_title,
        metaDescription: copy.meta_description,
        excerpt: copy.excerpt,
        body: copy.body,
        category: topic.category,
        heroImageUrl: hero?.imageUrl ?? null,
        heroImageAlt: hero
          ? `${hero.seoTitle ?? hero.title} — ${topic.category} boho de Boho Chic`
          : null,
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
