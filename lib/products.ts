import { and, asc, count, desc, eq, gte, ilike, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  CATEGORIES,
  Category,
  clickEvents,
  NewProduct,
  Product,
  Source,
  products,
  subscribers,
} from "@/lib/db/schema";
import { bumpCacheVersion, cacheGet, cacheSet } from "@/lib/cache";
import type { NormalizedProduct } from "@/lib/providers";

export const PAGE_SIZE = 24;

export interface StoreFilters {
  q?: string;
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
  const category = one(params.category);
  const sort = one(params.sort);
  return {
    q: one(params.q)?.trim().slice(0, 100) || undefined,
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Busca por slug SEO y, si el parámetro es un UUID, también por id. */
export async function getProductBySlugOrId(
  slugOrId: string
): Promise<Product | undefined> {
  const bySlug = await db
    .select()
    .from(products)
    .where(eq(products.slug, slugOrId))
    .limit(1);
  if (bySlug[0]) return bySlug[0];
  if (UUID_RE.test(slugOrId)) return getProductById(slugOrId);
  return undefined;
}

/** Piezas relacionadas de la misma categoría para la ficha. */
export async function getRelatedProducts(
  category: Category,
  excludeId: string,
  limit: number = 4
): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .where(
      and(
        eq(products.category, category),
        eq(products.isActive, true),
        eq(products.available, true),
        sql`${products.id} <> ${excludeId}`
      )
    )
    .orderBy(desc(products.clicks), desc(products.createdAt))
    .limit(limit);
}

/** Productos visibles con slug, para el sitemap. */
export async function getProductsForSitemap(): Promise<
  { slug: string; updatedAt: Date }[]
> {
  const rows = await db
    .select({ slug: products.slug, updatedAt: products.updatedAt })
    .from(products)
    .where(
      and(
        eq(products.isActive, true),
        eq(products.available, true),
        sql`${products.slug} IS NOT NULL`
      )
    );
  return rows.filter((r): r is { slug: string; updatedAt: Date } => r.slug !== null);
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
    rating: normalized.rating,
    ordersCount: normalized.ordersCount,
    discountPct: normalized.discountPct,
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
        rating: values.rating,
        ordersCount: values.ordersCount,
        discountPct: values.discountPct,
        updatedAt: sql`now()`,
        lastCheckedAt: sql`now()`,
      },
    })
    .returning();
  await bumpCacheVersion();
  return row;
}

/** Campos editables desde el panel admin (todo salvo id, origen y métricas). */
export type ProductPatch = Partial<
  Pick<
    Product,
    | "title"
    | "description"
    | "imageUrl"
    | "price"
    | "originalPrice"
    | "currency"
    | "affiliateUrl"
    | "productUrl"
    | "category"
    | "tags"
    | "available"
    | "isActive"
    | "slug"
    | "seoTitle"
    | "seoDescription"
    | "metaTitle"
    | "metaDescription"
    | "brand"
    | "gtin"
    | "color"
    | "size"
    | "feedExcluded"
  >
>;

export async function updateProduct(
  id: string,
  patch: ProductPatch
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

/** Registra un clic de afiliado con su fuente (ficha, look, quiz, home…). */
export async function recordClick(id: string, source: string): Promise<void> {
  await Promise.all([
    incrementClicks(id),
    db.insert(clickEvents).values({ productId: id, source: source.slice(0, 40) }),
  ]);
}

// Piezas que combinan con cada categoría, en orden de preferencia editorial.
const LOOK_MATCHES: Record<Category, Category[]> = {
  vestidos: ["kimonos", "bolsos", "calzado", "joyeria", "accesorios"],
  blusas: ["faldas", "pantalones", "bolsos", "joyeria", "calzado"],
  faldas: ["blusas", "bolsos", "calzado", "joyeria", "kimonos"],
  pantalones: ["blusas", "kimonos", "bolsos", "calzado", "joyeria"],
  kimonos: ["vestidos", "blusas", "bolsos", "joyeria", "calzado"],
  accesorios: ["vestidos", "bolsos", "joyeria", "calzado", "kimonos"],
  bolsos: ["vestidos", "faldas", "calzado", "joyeria", "kimonos"],
  calzado: ["vestidos", "faldas", "bolsos", "joyeria", "kimonos"],
  joyeria: ["vestidos", "blusas", "bolsos", "kimonos", "faldas"],
  otros: ["vestidos", "bolsos", "joyeria", "calzado", "kimonos"],
};

/**
 * Ensambla un "look" completo alrededor de un producto: una pieza de cada
 * categoría complementaria, priorizando las más populares. Sin llamada a IA
 * (rápido y gratis en cada visita); la lógica de combinación vive aquí.
 */
export async function getLookForProduct(
  product: Product,
  limit: number = 4
): Promise<Product[]> {
  const wanted = LOOK_MATCHES[product.category] ?? LOOK_MATCHES.otros;
  const candidates = await db
    .select()
    .from(products)
    .where(
      and(
        inArray(products.category, wanted),
        eq(products.isActive, true),
        eq(products.available, true),
        ne(products.id, product.id)
      )
    )
    .orderBy(desc(products.clicks), desc(products.createdAt))
    .limit(60);

  const look: Product[] = [];
  const usedCategories = new Set<string>();
  // Una pieza por categoría, siguiendo el orden de preferencia.
  for (const category of wanted) {
    if (look.length >= limit) break;
    const pick = candidates.find(
      (c) => c.category === category && !usedCategories.has(c.category)
    );
    if (pick) {
      look.push(pick);
      usedCategories.add(category);
    }
  }
  return look;
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
          // Solo se sobrescribe la prueba social si el refresco la aporta.
          ...(fresh.discountPct !== null ? { discountPct: fresh.discountPct } : {}),
          ...(fresh.rating !== null ? { rating: fresh.rating } : {}),
          ...(fresh.ordersCount !== null ? { ordersCount: fresh.ordersCount } : {}),
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
  const [{ value: missingSeoCount }] = await db
    .select({ value: count() })
    .from(products)
    .where(sql`${products.seoTitle} IS NULL`);
  const [{ value: subscribersCount }] = await db
    .select({ value: count() })
    .from(subscribers);
  const recent = await db
    .select()
    .from(products)
    .orderBy(desc(products.createdAt))
    .limit(8);
  return {
    totals,
    bySource,
    unavailableCount,
    missingSeoCount,
    subscribersCount,
    recent,
  };
}

/** Listado completo para la tabla del admin (sin filtro de visibilidad). */
export async function getAllProductsForAdmin(): Promise<Product[]> {
  return db.select().from(products).orderBy(desc(products.createdAt));
}

/** Candidatos complementarios (para la estilista del probador). */
export async function getComplementaryProducts(
  product: Product,
  limit: number = 30
): Promise<Product[]> {
  const wanted = LOOK_MATCHES[product.category] ?? LOOK_MATCHES.otros;
  return db
    .select()
    .from(products)
    .where(
      and(
        inArray(products.category, wanted),
        eq(products.isActive, true),
        eq(products.available, true),
        ne(products.id, product.id)
      )
    )
    .orderBy(desc(products.clicks), desc(products.discountPct))
    .limit(limit);
}

/** Feed personalizado para el resultado del quiz de estilo. */
export async function getProductsByProfile(
  categories: Category[],
  maxPrice: number | null,
  limit: number = 12
): Promise<Product[]> {
  const base = [eq(products.isActive, true), eq(products.available, true)];
  if (maxPrice !== null) base.push(lte(products.price, maxPrice.toFixed(2)));

  const withCategory =
    categories.length > 0
      ? [...base, inArray(products.category, categories)]
      : base;

  const rows = await db
    .select()
    .from(products)
    .where(and(...withCategory))
    .orderBy(desc(products.discountPct), desc(products.clicks))
    .limit(limit);

  // Si el filtro deja pocas piezas, se completa sin restringir categoría.
  if (rows.length >= Math.min(limit, 6) || categories.length === 0) return rows;
  const extra = await db
    .select()
    .from(products)
    .where(and(...base))
    .orderBy(desc(products.discountPct), desc(products.clicks))
    .limit(limit);
  const seen = new Set(rows.map((r) => r.id));
  return [...rows, ...extra.filter((r) => !seen.has(r.id))].slice(0, limit);
}

/**
 * Guarda o actualiza un suscriptor (quiz o newsletter). Devuelve si es un alta
 * nueva, para no repetirle la bienvenida a quien rehace el test: en un upsert de
 * Postgres, `xmax = 0` solo en las filas realmente insertadas.
 */
export async function addSubscriber(
  email: string,
  source: string,
  styleResult: string | null
): Promise<{ isNew: boolean }> {
  const rows = await db
    .insert(subscribers)
    .values({ email: email.toLowerCase(), source, styleResult })
    .onConflictDoUpdate({
      target: subscribers.email,
      set: { styleResult, source },
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return { isNew: rows[0]?.inserted === true };
}

/** IDs de origen ya guardados, para marcar duplicados en la búsqueda admin. */
export async function getSavedSourceIds(source: Source): Promise<Set<string>> {
  const rows = await db
    .select({ sourceProductId: products.sourceProductId })
    .from(products)
    .where(eq(products.source, source));
  return new Set(rows.map((r) => r.sourceProductId));
}
