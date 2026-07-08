import { neon } from "@neondatabase/serverless";
import {
  callNvidiaJson,
  embedText,
  EMBEDDING_MODEL,
  NvidiaMessage,
} from "@/lib/nvidia";

/**
 * "Encuentra este Look": catalogación (visión → descripción canónica en inglés
 * → embedding) y búsqueda semántica híbrida con pgvector. Estas tablas viven
 * fuera de Drizzle y se consultan por SQL crudo (operadores <=> de pgvector).
 */

function raw() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definida");
  return neon(url);
}

/** Serializa un vector a literal pgvector: [0.1,0.2,...] */
function toVector(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

// ---------- Esquema de atributos (compartido catálogo / búsqueda) ----------

export interface GarmentAttributes {
  type: string;
  colors?: string[];
  pattern?: string;
  fabric?: string;
  length?: string | null;
  sleeve?: string | null;
  neckline?: string | null;
  style_tags?: string[];
  details?: string[];
}

interface Catalogued {
  garment_description: string;
  attributes: GarmentAttributes;
}

const CATALOG_PROMPT = (title: string) =>
  `Eres un catalogador experto de moda. Analiza la imagen de este producto y su título: ${title}. Responde ÚNICAMENTE con JSON: {"garment_description": string (40-60 palabras EN INGLÉS: tipo, colores exactos, patrón, tejido aparente, largo, mangas, escote, detalles como flecos/crochet/bordado, estilo), "attributes": {"type": dress|kimono|top|blouse|skirt|pants|shorts|cardigan|jacket|earrings|necklace|bracelet|hat|bag|belt|shoes|other, "colors": [máx 3 en inglés], "pattern": floral|paisley|geometric|solid|striped|tie-dye|ethnic|other, "fabric": cotton|linen|chiffon|crochet|denim|leather|knit|unknown, "length": mini|midi|maxi|crop|regular|null, "sleeve": string|null, "neckline": string|null, "style_tags": [máx 5 en inglés], "details": [máx 5]}}. Formato consistente siempre.`;

/** Cataloga un producto (visión). Cae a título si no hay visión. */
export async function catalogProduct(product: {
  title: string;
  description: string | null;
  imageUrl: string;
}): Promise<{ result: Catalogued; visionUsed: boolean }> {
  const messages: NvidiaMessage[] = [
    { role: "system", content: CATALOG_PROMPT(product.title) },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: product.description
            ? `Descripción: ${product.description.slice(0, 400)}`
            : "Cataloga el producto.",
        },
        { type: "image_url", image_url: { url: product.imageUrl } },
      ],
    },
  ];
  const { data, visionUsed } = await callNvidiaJson<Catalogued>(messages, {
    needsVision: true,
    label: "catalogar",
    maxTokens: 500,
  });
  if (!data.garment_description || !data.attributes?.type) {
    throw new Error("catalogación incompleta");
  }
  return { result: data, visionUsed };
}

/** Indexa un producto: cataloga → embed(passage) → upsert. Idempotente. */
export async function indexProduct(product: {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string;
}): Promise<void> {
  const sql = raw();
  const { result } = await catalogProduct(product);
  const embedding = await embedText(result.garment_description, "passage");
  await sql`
    INSERT INTO product_embeddings
      (product_id, garment_description, attributes, embedding, embedding_model)
    VALUES (
      ${product.id},
      ${result.garment_description},
      ${JSON.stringify(result.attributes)}::jsonb,
      ${toVector(embedding)}::vector,
      ${EMBEDDING_MODEL}
    )
    ON CONFLICT (product_id) DO UPDATE SET
      garment_description = EXCLUDED.garment_description,
      attributes = EXCLUDED.attributes,
      embedding = EXCLUDED.embedding,
      embedding_model = EXCLUDED.embedding_model,
      created_at = now()
  `;
}

export interface EmbedBatchSummary {
  processed: number;
  errors: string[];
  remaining: number;
  done: boolean;
}

/**
 * Procesa hasta `limit` productos aún sin embebido para el modelo actual.
 * El LEFT JOIN hace la operación idempotente y reanudable por sí sola.
 */
export async function embedBatch(limit = 15): Promise<EmbedBatchSummary> {
  const sql = raw();
  const pending = (await sql`
    SELECT p.id, p.title, p.description, p.image_url AS "imageUrl"
    FROM products p
    LEFT JOIN product_embeddings e
      ON e.product_id = p.id::text AND e.embedding_model = ${EMBEDDING_MODEL}
    WHERE e.id IS NULL AND p.is_active = true AND p.available = true
    ORDER BY p.id
    LIMIT ${limit}
  `) as Array<{ id: string; title: string; description: string | null; imageUrl: string }>;

  const summary: EmbedBatchSummary = {
    processed: 0,
    errors: [],
    remaining: 0,
    done: false,
  };

  // En paralelo: la cola global (concurrencia 2) limita las llamadas a NIM y
  // así el lote cabe en el timeout de Hobby (~2x más rápido que en secuencia).
  const outcomes = await Promise.allSettled(
    pending.map((product) => indexProduct(product))
  );
  outcomes.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      summary.processed++;
    } else {
      const msg =
        outcome.reason instanceof Error ? outcome.reason.message : "error";
      summary.errors.push(`${pending[i].id}: ${msg}`);
    }
  });
  if (pending.length > 0) {
    const lastId = pending[pending.length - 1].id;
    await sql`
      INSERT INTO embed_progress (id, last_processed_product_id, updated_at)
      VALUES (1, ${lastId}, now())
      ON CONFLICT (id) DO UPDATE SET
        last_processed_product_id = ${lastId}, updated_at = now()
    `;
  }

  const [{ remaining }] = (await sql`
    SELECT count(*)::int AS remaining
    FROM products p
    LEFT JOIN product_embeddings e
      ON e.product_id = p.id::text AND e.embedding_model = ${EMBEDDING_MODEL}
    WHERE e.id IS NULL AND p.is_active = true AND p.available = true
  `) as Array<{ remaining: number }>;
  summary.remaining = remaining;
  summary.done = remaining === 0;
  return summary;
}

// ---------- Búsqueda ----------

export interface DetectedItem {
  item_name: string;
  garment_description: string;
  attributes: GarmentAttributes;
  prominence?: number;
  visible_enough?: boolean;
}

export interface LookDecomposition {
  person_detected: boolean;
  overall_style: string;
  items: DetectedItem[];
}

const DECOMPOSE_PROMPT = `Eres un estilista experto que descompone outfits. Analiza esta imagen (puede ser screenshot de Pinterest/Instagram/TikTok con texto o UI superpuestos: IGNÓRALOS, céntrate en la ropa de la persona principal). Identifica CADA prenda y accesorio visible. Responde ÚNICAMENTE con JSON: {"person_detected": boolean, "overall_style": string (español, máx 12 palabras), "items": [{"item_name": string (español, corto), "garment_description": string (40-60 palabras EN INGLÉS, formato canónico de catalogador), "attributes": {"type": string, "colors": [], "pattern": string, "fabric": string, "length": string|null, "sleeve": string|null, "neckline": string|null, "style_tags": [], "details": []}, "prominence": 0-1, "visible_enough": boolean}]}. Máx 6 items. No inventes prendas.`;

/** Descompone un outfit desde una imagen (base64 data URI o URL). */
export async function decomposeLook(imageDataUri: string): Promise<LookDecomposition> {
  const messages: NvidiaMessage[] = [
    { role: "system", content: DECOMPOSE_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: "Descompón este look." },
        { type: "image_url", image_url: { url: imageDataUri } },
      ],
    },
  ];
  const { data } = await callNvidiaJson<LookDecomposition>(messages, {
    needsVision: true,
    label: "descomponer",
    maxTokens: 1200,
  });
  return {
    person_detected: !!data.person_detected,
    overall_style: data.overall_style ?? "",
    items: Array.isArray(data.items) ? data.items.slice(0, 6) : [],
  };
}

// Tipos hermanos: si un tipo no da resultados, se relaja UNA vez a su pareja.
const SIBLINGS: Record<string, string[]> = {
  top: ["blouse"],
  blouse: ["top"],
  kimono: ["cardigan"],
  cardigan: ["kimono"],
  pants: ["shorts"],
  shorts: ["pants"],
  dress: ["skirt"],
};

const SIMILARITY_THRESHOLD = 0.55;

export interface Match {
  productId: string;
  slug: string | null;
  title: string;
  imageUrl: string;
  price: string;
  currency: string;
  similarity: number; // 0-1 tras re-ranking
}

interface EmbeddingRow {
  product_id: string;
  attributes: GarmentAttributes;
  similarity: number;
  title: string;
  slug: string | null;
  image_url: string;
  price: string;
  currency: string;
}

async function queryByType(
  vecLiteral: string,
  type: string
): Promise<EmbeddingRow[]> {
  const sql = raw();
  return (await sql`
    SELECT e.product_id, e.attributes,
           1 - (e.embedding <=> ${vecLiteral}::vector) AS similarity,
           p.title, p.slug, p.image_url, p.price, p.currency
    FROM product_embeddings e
    JOIN products p ON p.id::text = e.product_id
    WHERE e.attributes->>'type' = ${type}
      AND p.is_active = true AND p.available = true
    ORDER BY e.embedding <=> ${vecLiteral}::vector
    LIMIT 8
  `) as unknown as EmbeddingRow[];
}

/** Busca los mejores productos parecidos a una prenda detectada. */
export async function matchItem(item: DetectedItem): Promise<Match[]> {
  const embedding = await embedText(item.garment_description, "query");
  const vecLiteral = toVector(embedding);

  const wantedColors = (item.attributes.colors ?? []).map((c) => c.toLowerCase());
  const wantedDetails = (item.attributes.details ?? []).map((d) => d.toLowerCase());

  const rank = (rows: EmbeddingRow[]): Match[] =>
    rows
      .map((r) => {
        let score = r.similarity;
        const colors = (r.attributes.colors ?? []).map((c) => c.toLowerCase());
        const details = (r.attributes.details ?? []).map((d) => d.toLowerCase());
        if (wantedColors.length && colors.includes(wantedColors[0])) score += 0.05;
        if (wantedDetails.some((d) => details.includes(d))) score += 0.03;
        return {
          productId: r.product_id,
          slug: r.slug,
          title: r.title,
          imageUrl: r.image_url,
          price: r.price,
          currency: r.currency,
          similarity: Math.min(1, score),
        };
      })
      .filter((m) => m.similarity >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 4);

  let matches = rank(await queryByType(vecLiteral, item.attributes.type));

  // Relajación única a tipos hermanos si no hubo nada digno.
  if (matches.length === 0) {
    for (const sibling of SIBLINGS[item.attributes.type] ?? []) {
      matches = rank(await queryByType(vecLiteral, sibling));
      if (matches.length > 0) break;
    }
  }
  return matches;
}

/** Limpia búsquedas caducadas (>48h). Devuelve cuántas borró. */
export async function cleanupExpiredSearches(): Promise<number> {
  const sql = raw();
  const rows = (await sql`
    DELETE FROM look_searches WHERE expires_at < now() RETURNING id
  `) as Array<{ id: string }>;
  return rows.length;
}
