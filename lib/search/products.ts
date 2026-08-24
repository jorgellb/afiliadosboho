import { COLLECTIONS } from "@/lib/collections";
import type { Product } from "@/lib/db/schema";
import {
  PRODUCTS_INDEX,
  bulkRequest,
  indexBody,
  indexExists,
  isSearchConfigured,
  request,
} from "./opensearch";

/**
 * Indexación y búsqueda de productos en OpenSearch.
 *
 * Todo aquí devuelve null (o false) cuando el buscador no está disponible.
 * Quien llama debe caer al buscador SQL: ver getStoreProducts.
 */

/** Documento que se indexa. Solo lo que se busca, filtra u ordena. */
interface ProductDoc {
  title: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  brand: string | null;
  color: string | null;
  category: string;
  tags: string[];
  slug: string | null;
  price: number;
  discountPct: number | null;
  ordersCount: number | null;
  clicks: number;
  available: boolean;
  isActive: boolean;
  createdAt: string;
}

function toDoc(product: Product): ProductDoc {
  return {
    title: product.title,
    description: product.description,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    brand: product.brand,
    color: product.color,
    category: product.category,
    tags: product.tags,
    slug: product.slug,
    price: Number(product.price),
    discountPct: product.discountPct,
    ordersCount: product.ordersCount,
    clicks: product.clicks,
    available: product.available,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
  };
}

/**
 * Crea el índice si no existe. Idempotente.
 *
 * Se comprueba la existencia ANTES de intentar el PUT: crear un índice que ya
 * existe devuelve 400, y eso ensuciaba los logs con un error que no lo era.
 */
export async function ensureIndex(): Promise<boolean> {
  if (!isSearchConfigured()) return false;
  if (await indexExists()) return true;

  const created = await request<{ acknowledged?: boolean }>(
    `/${PRODUCTS_INDEX}`,
    { method: "PUT", body: indexBody() }
  );
  return created?.acknowledged === true;
}

/** Reindexa el catálogo completo. Devuelve cuántos documentos se enviaron. */
export async function reindexAll(products: Product[]): Promise<number> {
  if (!isSearchConfigured()) return 0;
  await ensureIndex();

  const lines: string[] = [];
  for (const product of products) {
    lines.push(JSON.stringify({ index: { _index: PRODUCTS_INDEX, _id: product.id } }));
    lines.push(JSON.stringify(toDoc(product)));
  }
  const ok = await bulkRequest(lines);
  return ok ? products.length : 0;
}

/** Indexa o actualiza un producto suelto. Silencioso si falla. */
export async function indexProduct(product: Product): Promise<void> {
  if (!isSearchConfigured()) return;
  await request(`/${PRODUCTS_INDEX}/_doc/${product.id}`, {
    method: "PUT",
    body: toDoc(product),
  });
}

/** Retira un producto del índice. Silencioso si falla. */
export async function removeProduct(id: string): Promise<void> {
  if (!isSearchConfigured()) return;
  await request(`/${PRODUCTS_INDEX}/_doc/${id}`, { method: "DELETE" });
}

/**
 * Empuje por categoría cuando el término buscado ES una categoría.
 *
 * Hace falta porque los títulos de AliExpress vienen atiborrados de palabras
 * clave. Un ejemplo real del catálogo: un cárdigan titulado "…Kimono frontal
 * abierto, Vestido largo de fiesta, prendas de vestir exteriores" salía PRIMERO
 * al buscar "vestido", porque la raíz "vestid" aparece dos veces en su título.
 * La coincidencia es legítima, pero un vestido de verdad debe ganarle.
 *
 * Se comparan las cinco primeras letras sin acentos, que es lo que hace falta
 * para que singular y plural caigan juntos (vestido/vestidos, bolso/bolsos)
 * sin arrastrar palabras ajenas ("sandalia" no casa con "calzado", y está bien:
 * ahí no hay categoría que empujar).
 */
function categoryBoosts(q: string): unknown[] {
  // Se quitan las tildes con un mapa explícito de las cinco vocales en vez de
  // con NFD y una clase de marcas combinantes: aquí solo hacen falta esas, y
  // son caracteres imprimibles que sobreviven a cualquier edición del archivo.
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[áàä]/g, "a")
      .replace(/[éèë]/g, "e")
      .replace(/[íìï]/g, "i")
      .replace(/[óòö]/g, "o")
      .replace(/[úùü]/g, "u");

  const words = normalize(q).split(/\s+/).filter((w) => w.length >= 4);
  const matched = new Set<string>();

  for (const collection of COLLECTIONS) {
    const name = normalize(collection.category);
    for (const word of words) {
      if (word.slice(0, 5) === name.slice(0, 5)) matched.add(collection.category);
    }
  }

  return [...matched].map((category) => ({
    term: { category: { value: category, boost: 6 } },
  }));
}

export interface SearchQuery {
  q: string;
  category?: string;
  min?: number;
  max?: number;
  sort?: "recientes" | "precio_asc" | "precio_desc";
  from: number;
  size: number;
}

export interface SearchHits {
  /** IDs en orden de relevancia. La ficha completa se lee de Postgres. */
  ids: string[];
  total: number;
}

interface OsResponse {
  hits: {
    total: { value: number };
    hits: Array<{ _id: string }>;
  };
}

/**
 * Busca y devuelve IDs ordenados. Null si el buscador no está disponible, para
 * que quien llama caiga al SQL.
 *
 * Se devuelven IDs y no documentos a propósito: Postgres sigue siendo la
 * fuente de verdad de precio y disponibilidad. Si el índice va desfasado unos
 * minutos, el orden puede ser algo peor, pero los datos que ve el usuario son
 * siempre los buenos.
 */
export async function searchProducts(
  query: SearchQuery
): Promise<SearchHits | null> {
  if (!isSearchConfigured()) return null;

  const filters: unknown[] = [
    { term: { isActive: true } },
    { term: { available: true } },
  ];
  if (query.category) filters.push({ term: { category: query.category } });
  if (query.min !== undefined || query.max !== undefined) {
    filters.push({
      range: {
        price: {
          ...(query.min !== undefined ? { gte: query.min } : {}),
          ...(query.max !== undefined ? { lte: query.max } : {}),
        },
      },
    });
  }

  const sort =
    query.sort === "precio_asc"
      ? [{ price: "asc" }]
      : query.sort === "precio_desc"
        ? [{ price: "desc" }]
        : query.q
          ? ["_score", { clicks: "desc" }]
          : [{ createdAt: "desc" }];

  const body = {
    from: query.from,
    size: query.size,
    track_total_hits: true,
    query: {
      bool: {
        filter: filters,
        must: query.q
          ? [
              {
                multi_match: {
                  query: query.q,
                  // Solo campos que IDENTIFICAN la pieza. seoDescription queda
                  // fuera a propósito: casaba "vestido" en 122 de 190 fichas
                  // porque el copy de la IA dice "combínalo con un vestido" en
                  // kimonos, bolsos y calzado.
                  fields: ["title^4", "seoTitle^3", "tags^2", "brand", "color"],
                  type: "best_fields",
                  fuzziness: "AUTO",
                  // Las dos primeras letras deben coincidir exactamente. Sin
                  // esto, la distancia de edición 2 de AUTO arrastraba 44
                  // resultados sin relación; con esto, "kimno" sigue
                  // encontrando los kimonos.
                  prefix_length: 2,
                  operator: "and",
                },
              },
            ]
          : [{ match_all: {} }],
        // No filtra: solo reordena. Si el término ES una categoría, sus piezas
        // suben por encima de las que solo la mencionan en el título.
        should: query.q ? categoryBoosts(query.q) : [],
      },
    },
    sort,
    _source: false,
  };

  const result = await request<OsResponse>(
    `/${PRODUCTS_INDEX}/_search`,
    { method: "POST", body }
  );
  if (!result?.hits) return null;

  return {
    ids: result.hits.hits.map((h) => h._id),
    total: result.hits.total.value,
  };
}
