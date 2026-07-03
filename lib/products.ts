import { and, asc, count, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  CATEGORIES,
  Category,
  NewProduct,
  Product,
  SOURCES,
  Source,
  products,
} from "@/lib/db/schema";
import { bumpCacheVersion, cacheGet, cacheSet } from "@/lib/cache";
import type { NormalizedProduct } from "@/lib/providers";

export const PAGE_SIZE = 24;

export interface StoreFilters {
  q?: string;
  source?: Source;
  category?: Category;
  min?: number;
  max?: number;
  sort?: "recientes" | "precio_asc" | "precio_desc";
  page?: number;
}

export interface StoreResult {
  items: Product[];
  total: number;
  page: number;
  totalPages: number;
}

/** Normaliza searchParams crudos a filtros tipados y seguros. */
export function parseStoreFilters(params: {
  [key: string]: string | string[] | undefined;
}): StoreFilters {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const num = (v: string | undefined) => {
    const n = Number(v);
    return v !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const source = one(params.source);
  const category = one(params.category);
  const sort = one(params.sort);
  return {
    q: one(params.q)?.trim().slice(0, 100) || undefined,
    source: SOURCES.includes(source as Source) ? (source as Source) : undefined,
    category: CATEGORIES.includes(category as Category)
      ? (category as Category)
      : undefined,
    min: num(one(params.min)),
    max: num(one(params.max)),
    sort:
      sort === "precio_asc" || sort === "precio_desc" ? sort : "recientes",
    page: Math.max(1, Math.trunc(num(one(params.page)) ?? 1)),
  };
}

function storeConditions(filters: StoreFilters) {
  const conditions = [eq(products.isActive, true), eq(products.available, true)];
  if (filters.q) {
    conditions.push(ilike(products.title, `%${filters.q}%`));
  }
  if (filters.source) conditions.push(eq(products.source, filters.source));
  if (filters.category) conditions.push(eq(products.category, filters.category));
  if (filters.min !== undefined)
    conditions.push(gte(products.price, filters.min.toFixed(2)));
  if (filters.max !== undefined)
    conditions.push(lte(products.price, filters.max.toFixed(2)));
  return and(...conditions);
}

/** Listado público con caché cache-aside (TTL 10 min, versión global). */
export async function getStoreProducts(filters: StoreFilters): Promise<StoreResult> {
  const page = filters.page ?? 1;
  const cacheKey = `store:${JSON.stringify([
    filters.q ?? "",
    filters.source ?? "",
    filters.category ?? "",
    filters.min ?? "",
    filters.max ?? "",
    filters.sort ?? "",
    page,
  ])}`;

  const cached = await cacheGet<StoreResult>(cacheKey);
  if (cached) return cached;

  const where = storeConditions(filters);
  const orderBy =
    filters.sort === "precio_asc"
      ? asc(products.price)
      : filters.sort === "precio_desc"
        ? desc(products.price)
        : desc(products.createdAt);

  const [items, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(products)
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(products).where(where),
  ]);

  const result: StoreResult = {
    items,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
  await cacheSet(cacheKey, result);
  return result;
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return rows[0];
}

/** Inserta o actualiza (por source + source_product_id) un producto normalizado. */
export async function upsertProduct(
  normalized: NormalizedProduct,
  extras: { category?: Category; tags?: string[] } = {}
): Promise<Product> {
  if (normalized.price === null) {
    throw new Error("El producto no tiene precio activo; no se puede guardar.");
  }
  const values: NewProduct = {
    source: normalized.source,
    sourceProductId: normalized.sourceProductId,
    title: normalized.title,
    description: normalized.description,
    imageUrl: normalized.imageUrl,
    price: normalized.price,
    currency: normalized.currency,
    originalPrice: normalized.originalPrice,
    affiliateUrl: normalized.affiliateUrl,
    productUrl: normalized.productUrl,
    available: normalized.available,
    category: extras.category ?? "otros",
    tags: extras.tags ?? [],
  };
  const [row] = await db
    .insert(products)
    .values(values)
    .onConflictDoUpdate({
      target: [products.source, products.sourceProductId],
      set: {
        title: values.title,
        description: values.description,
        imageUrl: values.imageUrl,
        price: values.price,
        currency: values.currency,
        originalPrice: values.originalPrice,
        affiliateUrl: values.affiliateUrl,
        productUrl: values.productUrl,
        available: values.available,
        updatedAt: sql`now()`,
        lastCheckedAt: sql`now()`,
      },
    })
    .returning();
  await bumpCacheVersion();
  return row;
}

export async function updateProduct(
  id: string,
  patch: Partial<
    Pick<Product, "category" | "tags" | "isActive" | "title" | "price">
  >
): Promise<Product | undefined> {
  const [row] = await db
    .update(products)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(products.id, id))
    .returning();
  await bumpCacheVersion();
  return row;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const rows = await db.delete(products).where(eq(products.id, id)).returning({
    id: products.id,
  });
  await bumpCacheVersion();
  return rows.length > 0;
}

export async function incrementClicks(id: string): Promise<void> {
  await db
    .update(products)
    .set({ clicks: sql`${products.clicks} + 1` })
    .where(eq(products.id, id));
}

/** Productos con el chequeo de precio más antiguo, para el cron. */
export async function getStalestProducts(limit: number): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .orderBy(asc(products.lastCheckedAt))
    .limit(limit);
}

/** Aplica el resultado del refresco de precios de un lote del cron. */
export async function applyPriceRefresh(
  requested: Product[],
  fetched: NormalizedProduct[]
): Promise<{ updated: number; unavailable: number }> {
  const bySourceId = new Map(fetched.map((p) => [p.sourceProductId, p]));
  let updated = 0;
  let unavailable = 0;

  for (const product of requested) {
    const fresh = bySourceId.get(product.sourceProductId);
    if (fresh && fresh.price !== null) {
      await db
        .update(products)
        .set({
          price: fresh.price,
          currency: fresh.currency,
          originalPrice: fresh.originalPrice,
          affiliateUrl: fresh.affiliateUrl,
          available: fresh.available,
          updatedAt: sql`now()`,
          lastCheckedAt: sql`now()`,
        })
        .where(eq(products.id, product.id));
      updated++;
    } else {
      // El proveedor ya no devuelve el producto (o no tiene oferta): sin stock.
      await db
        .update(products)
        .set({
          available: false,
          updatedAt: sql`now()`,
          lastCheckedAt: sql`now()`,
        })
        .where(eq(products.id, product.id));
      unavailable++;
    }
  }
  return { updated, unavailable };
}

/** Métricas simples para el dashboard admin. */
export async function getAdminStats() {
  const [totals] = await db
    .select({
      total: count(),
      clicks: sql<number>`coalesce(sum(${products.clicks}), 0)`,
    })
    .from(products);
  const bySource = await db
    .select({ source: products.source, total: count() })
    .from(products)
    .groupBy(products.source);
  const [{ value: unavailableCount }] = await db
    .select({ value: count() })
    .from(products)
    .where(eq(products.available, false));
  const recent = await db
    .select()
    .from(products)
    .orderBy(desc(products.createdAt))
    .limit(8);
  return { totals, bySource, unavailableCount, recent };
}

/** Listado completo para la tabla del admin (sin filtro de visibilidad). */
export async function getAllProductsForAdmin(): Promise<Product[]> {
  return db.select().from(products).orderBy(desc(products.createdAt));
}

/** IDs de origen ya guardados, para marcar duplicados en la búsqueda admin. */
export async function getSavedSourceIds(source: Source): Promise<Set<string>> {
  const rows = await db
    .select({ sourceProductId: products.sourceProductId })
    .from(products)
    .where(eq(products.source, source));
  return new Set(rows.map((r) => r.sourceProductId));
}
