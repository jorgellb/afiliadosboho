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
import { sql as raw } from "@/lib/db/pool";
import {
  indexProduct,
  removeProduct,
  searchProducts,
} from "@/lib/search/products";
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
    // El campo VACIO tiene que ser "sin filtro", no cero.
    //
    // Number("") devuelve 0, no NaN. Y el formulario envia siempre min= y max=
    // aunque el usuario no los rellene, asi que toda busqueda hecha desde la
    // caja acababa filtrando "precio <= 0" y devolviendo cero resultados.
    // Por URL, sin esos parametros, funcionaba: por eso el fallo sobrevivio.
    if (v === undefined || v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
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

/**
 * Convierte los IDs que devuelve el buscador en productos completos.
 *
 * Los datos se leen SIEMPRE de Postgres, que es la fuente de verdad: si el
 * índice va unos minutos desfasado, el orden puede ser algo peor, pero el
 * precio y la disponibilidad que ve el usuario son los buenos. Además se
 * descartan los IDs que ya no existan en la base, para que un índice sucio
 * no produzca huecos ni enlaces rotos.
 */
async function hydrateHits(
  ids: string[],
  total: number,
  page: number
): Promise<StoreResult> {
  if (ids.length === 0) {
    return { items: [], total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  }
  const rows = await db.select().from(products).where(inArray(products.id, ids));
  const byId = new Map(rows.map((row) => [row.id, row]));
  // Se respeta el orden de relevancia que dio el buscador, que se pierde al
  // consultar por inArray.
  const items = ids
    .map((id) => byId.get(id))
    .filter((row): row is Product => row !== undefined);

  return {
    items,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
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

  // Con término de búsqueda se intenta OpenSearch: entiende raíces
  // ("vestido" encuentra "vestidos"), ignora acentos, tolera erratas y ordena
  // por relevancia, cosas que el ILIKE sobre el título no puede hacer.
  // Si no está configurado o no responde, devuelve null y seguimos con SQL:
  // el buscador nunca debe tumbar la tienda.
  if (filters.q) {
    const hits = await searchProducts({
      q: filters.q,
      category: filters.category,
      min: filters.min,
      max: filters.max,
      sort: filters.sort,
      from: (page - 1) * PAGE_SIZE,
      size: PAGE_SIZE,
    });
    if (hits) {
      const result = await hydrateHits(hits.ids, hits.total, page);
      await cacheSet(cacheKey, result);
      return result;
    }
  }

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
  // El indice se sincroniza en segundo plano: si OpenSearch no responde, el
  // alta del producto no debe fallar por ello.
  if (row) await indexProduct(row);
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
  if (row) await indexProduct(row);
  return row;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const rows = await db.delete(products).where(eq(products.id, id)).returning({
    id: products.id,
  });
  await bumpCacheVersion();
  if (rows.length) await removeProduct(id);
  return rows.length > 0;
}

export async function incrementClicks(id: string): Promise<void> {
  await db
    .update(products)
    .set({ clicks: sql`${products.clicks} + 1` })
    .where(eq(products.id, id));
}

/** Registra un clic de afiliado con su fuente (ficha, look, quiz, home…). */
/**
 * Registra un clic de salida.
 *
 * `countTowardsProduct` en false para los bots: el evento se guarda (con su
 * etiqueta `bot:`) pero `products.clicks` NO se incrementa, así que ese
 * contador —el que ordena los relacionados y se enseña en el panel— refleja
 * solo interés humano. De paso se ahorra un UPDATE por cada visita de
 * rastreador, que no era poco: eran la mayoría del tráfico a /go.
 */
export async function recordClick(
  id: string,
  source: string,
  options: { countTowardsProduct?: boolean } = {}
): Promise<void> {
  const { countTowardsProduct = true } = options;
  const writes: Promise<unknown>[] = [
    db.insert(clickEvents).values({ productId: id, source: source.slice(0, 40) }),
  ];
  if (countTowardsProduct) writes.push(incrementClicks(id));
  await Promise.all(writes);
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

  // Reparto humanos / bots.
  //
  // La frontera se calcula sola: es el PRIMER clic marcado como bot, es decir
  // el momento en que empezó a haber detección. Todo lo anterior queda como
  // "sin clasificar" y no se suma a humanos — mezclarlo daría una cifra
  // falsamente buena, que es justo el problema que este cambio venía a
  // resolver. Mientras no haya ningún bot detectado, todo es histórico.
  const [clickSplit] = await raw<{
    humans: number;
    bots: number;
    unclassified: number;
  }>`
    WITH inicio AS (
      SELECT min(created_at) AS desde FROM click_events WHERE source LIKE 'bot:%'
    )
    SELECT
      count(*) FILTER (
        WHERE source NOT LIKE 'bot:%'
          AND (SELECT desde FROM inicio) IS NOT NULL
          AND created_at >= (SELECT desde FROM inicio)
      )::int AS humans,
      count(*) FILTER (WHERE source LIKE 'bot:%')::int AS bots,
      count(*) FILTER (
        WHERE source NOT LIKE 'bot:%'
          AND ((SELECT desde FROM inicio) IS NULL
               OR created_at < (SELECT desde FROM inicio))
      )::int AS unclassified
    FROM click_events
  `;

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
    clickSplit,
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
