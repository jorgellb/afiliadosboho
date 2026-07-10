import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { Article, NewArticle, articles } from "@/lib/db/schema";
import { bumpCacheVersion } from "@/lib/cache";
import { slugify } from "@/lib/seo";

/**
 * Artículos de la revista desde el panel: aquí sí se ven los borradores.
 * (La lectura pública vive en lib/content.ts y solo devuelve publicados.)
 */

export async function getAllArticles(): Promise<Article[]> {
  return db.select().from(articles).orderBy(desc(articles.updatedAt));
}

export async function getArticleById(id: string): Promise<Article | undefined> {
  const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  return rows[0];
}

/** ¿Otro artículo ya usa este slug? El slug es único y forma la URL. */
export async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const where = exceptId
    ? and(eq(articles.slug, slug), ne(articles.id, exceptId))
    : eq(articles.slug, slug);
  const rows = await db.select({ id: articles.id }).from(articles).where(where).limit(1);
  return rows.length > 0;
}

/** Convierte un título en slug libre, añadiendo -2, -3… si hace falta. */
export async function uniqueSlug(title: string, exceptId?: string): Promise<string> {
  const base = slugify(title) || "articulo";
  let candidate = base;
  for (let n = 2; await slugTaken(candidate, exceptId); n++) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}

export type ArticlePatch = Partial<
  Pick<
    NewArticle,
    | "slug"
    | "title"
    | "metaTitle"
    | "metaDescription"
    | "excerpt"
    | "body"
    | "category"
    | "heroImageUrl"
    | "heroImageAlt"
    | "productIds"
    | "published"
  >
>;

export async function updateArticle(id: string, patch: ArticlePatch): Promise<Article | undefined> {
  const rows = await db
    .update(articles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(articles.id, id))
    .returning();
  if (rows.length) await bumpCacheVersion();
  return rows[0];
}

export async function createArticle(value: NewArticle): Promise<Article> {
  const rows = await db.insert(articles).values(value).returning();
  await bumpCacheVersion();
  return rows[0];
}

export async function deleteArticle(id: string): Promise<boolean> {
  const rows = await db.delete(articles).where(eq(articles.id, id)).returning({ id: articles.id });
  if (rows.length) await bumpCacheVersion();
  return rows.length > 0;
}

/** Enlaces internos que ofrece el editor al insertar un vínculo. */
export async function getInternalLinks(
  exceptId?: string
): Promise<Array<{ label: string; href: string }>> {
  const rows = await db
    .select({ id: articles.id, slug: articles.slug, title: articles.title })
    .from(articles)
    .where(eq(articles.published, true))
    .orderBy(desc(articles.createdAt))
    .limit(30);
  return rows
    .filter((r) => r.id !== exceptId)
    .map((r) => ({ label: r.title, href: `/revista/${r.slug}` }));
}
