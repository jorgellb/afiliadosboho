/**
 * Cliente de OpenSearch (Aiven) por API REST.
 *
 * Se habla con `fetch` en vez de con el SDK oficial: la superficie que usamos
 * son cuatro llamadas, y el SDK arrastra dependencias de Node que complican el
 * despliegue en serverless.
 *
 * REGLA DE ORO: el buscador NUNCA debe tumbar la tienda. Si OpenSearch no está
 * configurado, no responde o tarda demasiado, todas las funciones devuelven
 * null y quien llama cae al buscador SQL de siempre. Un catálogo que se ve
 * peor ordenado es infinitamente mejor que una tienda caída.
 */

export const PRODUCTS_INDEX = "productos";

/** Timeout corto: si el índice no responde rápido, mejor caer al SQL. */
const TIMEOUT_MS = 3000;

interface Config {
  /** Origen sin credenciales ni barra final. */
  base: string;
  /** Cabecera Authorization ya montada, o null si la URL no traía usuario. */
  auth: string | null;
}

let parsed: Config | null | undefined;

/**
 * Aiven entrega la URL con las credenciales dentro
 * (`https://usuario:clave@host:puerto`), pero `fetch` RECHAZA esas URLs:
 * "Request cannot be constructed from a URL that includes credentials". Hay
 * que separarlas y mandarlas como Basic auth.
 */
function config(): Config | null {
  if (parsed !== undefined) return parsed;

  const raw = process.env.OPENSEARCH_URL?.trim();
  if (!raw) {
    parsed = null;
    return null;
  }

  try {
    const url = new URL(raw);
    const user = decodeURIComponent(url.username);
    const pass = decodeURIComponent(url.password);
    // Se vacían antes de recomponer el origen, para que las credenciales no
    // acaben en ninguna URL que luego se registre en un log.
    url.username = "";
    url.password = "";
    parsed = {
      base: url.toString().replace(/\/$/, ""),
      auth: user
        ? `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`
        : null,
    };
  } catch {
    console.error("[opensearch] OPENSEARCH_URL no es una URL válida");
    parsed = null;
  }
  return parsed;
}

/** Cabeceras comunes, con autenticación si la hay. */
function headers(contentType: string): Record<string, string> {
  const cfg = config();
  return {
    "Content-Type": contentType,
    ...(cfg?.auth ? { Authorization: cfg.auth } : {}),
  };
}

/**
 * Nunca dejar que un mensaje de error arrastre la URL con credenciales: el
 * propio fetch las incluye en su mensaje, y de ahí acaban en los logs.
 */
function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\/\/[^@/\s]+@/g, "//***@");
}

/** True si hay buscador configurado. Para diagnóstico en el panel. */
export function isSearchConfigured(): boolean {
  return config() !== null;
}

/**
 * Petición a OpenSearch. Devuelve null ante cualquier problema, nunca lanza:
 * las credenciales viajan en la propia URL (usuario:contraseña@host), que es
 * el formato que da Aiven.
 */
async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T | null> {
  const cfg = config();
  if (!cfg) return null;

  try {
    const response = await fetch(`${cfg.base}${path}`, {
      method: init.method ?? "GET",
      headers: headers("application/json"),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error(
        `[opensearch] ${init.method ?? "GET"} ${path} -> ${response.status}`
      );
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error(`[opensearch] ${path} falló: ${safeMessage(error)}`);
    return null;
  }
}

/** Igual que request pero para el endpoint _bulk, que usa NDJSON. */
async function bulkRequest(lines: string[]): Promise<boolean> {
  const cfg = config();
  if (!cfg || lines.length === 0) return false;

  try {
    const response = await fetch(`${cfg.base}/_bulk`, {
      method: "POST",
      headers: headers("application/x-ndjson"),
      // El cuerpo NDJSON debe terminar en salto de línea o se rechaza entero.
      body: lines.join("\n") + "\n",
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error(`[opensearch] _bulk -> ${response.status}`);
      return false;
    }
    const result = (await response.json()) as { errors?: boolean };
    if (result.errors) console.error("[opensearch] _bulk con errores parciales");
    return !result.errors;
  } catch (error) {
    console.error(`[opensearch] _bulk falló: ${safeMessage(error)}`);
    return false;
  }
}

export async function ping(): Promise<{ version: string } | null> {
  const info = await request<{ version?: { number?: string } }>("/");
  if (!info?.version?.number) return null;
  return { version: info.version.number };
}

/**
 * Mapa del índice de productos.
 *
 * El analizador español aporta lo que el ILIKE actual no puede: separa por
 * raíces (buscar "vestido" encuentra "vestidos"), quita acentos y descarta
 * palabras vacías.
 *
 * Las erratas se cubren con `fuzziness` en la consulta, no con un subcampo de
 * trigramas: para 196 productos la distancia de edición basta y ahorra
 * duplicar el índice.
 *
 * OJO con seoDescription: se indexa (sirve para futuras funciones) pero NO se
 * busca por defecto. Medido sobre el catálogo real, "vestido" casa en 122 de
 * 190 productos solo por esa columna, porque el texto que redacta la IA repite
 * "combínalo con un vestido" en fichas de kimonos, bolsos y calzado. Incluirla
 * hundía la precisión y colaba un cárdigan como primer resultado de "vestido".
 */
const INDEX_BODY = {
  settings: {
    "index.number_of_shards": 1,
    // Un solo nodo en los planes pequeños: con réplicas el índice se queda
    // en amarillo para siempre esperando un nodo que no existe.
    "index.number_of_replicas": 0,
    analysis: {
      filter: {
        spanish_stop: { type: "stop", stopwords: "_spanish_" },
        spanish_stemmer: { type: "stemmer", language: "light_spanish" },
      },
      analyzer: {
        es_text: {
          type: "custom",
          tokenizer: "standard",
          filter: ["lowercase", "asciifolding", "spanish_stop", "spanish_stemmer"],
        },
      },
    },
  },
  mappings: {
    properties: {
      title: { type: "text", analyzer: "es_text" },
      description: { type: "text", analyzer: "es_text" },
      seoTitle: { type: "text", analyzer: "es_text" },
      seoDescription: { type: "text", analyzer: "es_text" },
      brand: { type: "keyword" },
      color: { type: "keyword" },
      category: { type: "keyword" },
      // text para poder buscar dentro de la frase ("vestido mini bohemio"),
      // con subcampo keyword por si algun dia se filtra por tag exacto.
      tags: {
        type: "text",
        analyzer: "es_text",
        fields: { raw: { type: "keyword" } },
      },
      slug: { type: "keyword" },
      imageUrl: { type: "keyword", index: false },
      currency: { type: "keyword", index: false },
      price: { type: "double" },
      discountPct: { type: "integer" },
      ordersCount: { type: "integer" },
      clicks: { type: "integer" },
      available: { type: "boolean" },
      isActive: { type: "boolean" },
      createdAt: { type: "date" },
    },
  },
};

export function indexBody() {
  return INDEX_BODY;
}

export async function indexExists(): Promise<boolean> {
  const cfg = config();
  if (!cfg) return false;
  try {
    const response = await fetch(`${cfg.base}/${PRODUCTS_INDEX}`, {
      method: "HEAD",
      headers: headers("application/json"),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export { request, bulkRequest };
