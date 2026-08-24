import { and, desc, eq, gte, ilike, lte, or, SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { CATEGORIES, Category, products } from "@/lib/db/schema";
import { ProviderError, getProvider } from "@/lib/providers";
import { upsertProduct } from "@/lib/products";
import { chat, type LlmMessage } from "@/lib/llm";

/**
 * Asistente de moda con tool calling. El modelo puede buscar en el catálogo
 * local y recomendar productos; la UI muestra las tarjetas con el enlace de
 * afiliado (/go/[id]). El proveedor lo decide lib/llm.ts.
 */

const MAX_TOOL_ROUNDS = 3;
const MAX_PRODUCTS = 8;

export interface AssistantProduct {
  id: string;
  title: string;
  price: string;
  currency: string;
  originalPrice: string | null;
  imageUrl: string;
  category: string;
  source: string;
  discountPct: number | null;
  rating: string | null;
  ordersCount: number | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantResult {
  reply: string;
  products: AssistantProduct[];
  /** Preguntas/acciones sugeridas para continuar la conversación. */
  suggestions: string[];
}

// Categorías complementarias para montar un look completo, por pieza base.
const OUTFIT_MATCHES: Record<Category, Category[]> = {
  vestidos: ["kimonos", "bolsos", "calzado", "joyeria"],
  blusas: ["faldas", "bolsos", "calzado", "joyeria"],
  faldas: ["blusas", "bolsos", "calzado", "joyeria"],
  pantalones: ["blusas", "kimonos", "bolsos", "calzado"],
  kimonos: ["vestidos", "bolsos", "calzado", "joyeria"],
  accesorios: ["vestidos", "bolsos", "calzado", "joyeria"],
  bolsos: ["vestidos", "calzado", "joyeria", "kimonos"],
  calzado: ["vestidos", "bolsos", "joyeria", "kimonos"],
  joyeria: ["vestidos", "bolsos", "calzado", "kimonos"],
  otros: ["vestidos", "bolsos", "calzado", "joyeria"],
};

const SYSTEM_PROMPT = `Eres "Boho", la estilista virtual de una tienda online de moda boho chic. Eres cercana, resolutiva y con criterio de moda.

Cómo trabajas:
- Respondes SIEMPRE en el idioma del usuario (normalmente español), con tono cálido y BREVE (máximo ~110 palabras).
- Si el usuario solo saluda o charla, conversa directamente SIN herramientas. Nunca hables de "funciones" ni de herramientas.
- Si te piden UNA prenda concreta ("un vestido", "una falda") o buscan por precio/color, usa search_products (palabras clave cortas en español). Si el catálogo da menos de 2 opciones, usa search_aliexpress para traer novedades.
- Si te piden un LOOK completo, un OUTFIT, "qué me pongo" o mencionan una ocasión (boda, playa, festival, oficina, cita...), usa build_outfit para montar un conjunto coordinado (prenda principal + capas + bolso + calzado + joya). Menciona el precio TOTAL del look que te devuelve la herramienta.
- Si la petición es ambigua (no sabes ocasión ni presupuesto), puedes hacer UNA sola pregunta corta antes de buscar, o proponer algo y ofrecer afinarlo. No hagas más de una pregunta.
- Solo recomiendas productos que las herramientas devuelvan; menciónalos por su título abreviado y explica en una frase POR QUÉ combinan. Nunca inventes productos, precios ni enlaces.
- Cierra proponiendo cómo completar o afinar el look (otra pieza, otro color, otro presupuesto).
- NUNCA menciones AliExpress, proveedores, afiliados ni comisiones: para el cliente todo es "la tienda" o "nuestra colección".`;

interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}

export interface ApiMessage {
  role: string;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

const SEARCH_TOOL = {
  type: "function",
  function: {
    name: "search_products",
    description:
      "Busca productos disponibles en el catálogo de la tienda boho chic. Devuelve id, título, precio y categoría de cada producto.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Palabras clave en español para buscar en el título (ej. 'vestido playa'). Opcional.",
        },
        category: {
          type: "string",
          enum: [...CATEGORIES],
          description: "Filtrar por categoría. Opcional.",
        },
        min_price: { type: "number", description: "Precio mínimo. Opcional." },
        max_price: { type: "number", description: "Precio máximo. Opcional." },
      },
      required: [],
    },
  },
};

const ALIEXPRESS_TOOL = {
  type: "function",
  function: {
    name: "search_aliexpress",
    description:
      "Busca productos nuevos en AliExpress cuando el catálogo de la tienda no tiene suficientes opciones. Los resultados se añaden automáticamente al catálogo.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Palabras clave en español (ej. 'kimono boho verano').",
        },
        category: {
          type: "string",
          enum: [...CATEGORIES],
          description: "Categoría de la tienda que corresponde a la búsqueda.",
        },
        max_price: { type: "number", description: "Precio máximo. Opcional." },
      },
      required: ["query"],
    },
  },
};

async function searchProducts(args: {
  query?: string;
  category?: string;
  min_price?: number;
  max_price?: number;
}): Promise<AssistantProduct[]> {
  const conditions: (SQL | undefined)[] = [
    eq(products.isActive, true),
    eq(products.available, true),
  ];

  const words = (args.query ?? "")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3)
    .slice(0, 5);
  if (words.length > 0) {
    conditions.push(or(...words.map((w) => ilike(products.title, `%${w}%`))));
  }
  if (args.category && CATEGORIES.includes(args.category as Category)) {
    conditions.push(eq(products.category, args.category as Category));
  }
  if (typeof args.min_price === "number" && args.min_price >= 0) {
    conditions.push(gte(products.price, args.min_price.toFixed(2)));
  }
  if (typeof args.max_price === "number" && args.max_price > 0) {
    conditions.push(lte(products.price, args.max_price.toFixed(2)));
  }

  const rows = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.clicks), desc(products.createdAt))
    .limit(6);

  return rows.map(toAssistantProduct);
}

/**
 * Busca en vivo en AliExpress y guarda los resultados en el catálogo (tags
 * "asistente"), de modo que las tarjetas usen /go/[id] con clic contado y la
 * tienda crezca con cada recomendación.
 */
async function searchAliexpressAndSave(args: {
  query?: string;
  category?: string;
  max_price?: number;
}): Promise<AssistantProduct[]> {
  const query = (args.query ?? "").trim();
  if (!query) return [];
  const category = CATEGORIES.includes(args.category as Category)
    ? (args.category as Category)
    : "otros";

  const results = await getProvider("aliexpress").search(query, 1);
  const priced = results
    .filter(
      (r) =>
        r.price !== null &&
        r.available &&
        (typeof args.max_price !== "number" ||
          args.max_price <= 0 ||
          Number(r.price) <= args.max_price)
    )
    .slice(0, 5);

  const saved: AssistantProduct[] = [];
  for (const result of priced) {
    const row = await upsertProduct(result, { category, tags: ["asistente"] });
    saved.push({
      id: row.id,
      title: row.title,
      price: row.price,
      currency: row.currency,
      originalPrice: row.originalPrice,
      imageUrl: row.imageUrl,
      category: row.category,
      source: row.source,
      discountPct: row.discountPct,
      rating: row.rating,
      ordersCount: row.ordersCount,
    });
  }
  return saved;
}

// Herramienta para montar un look completo coordinado.
const OUTFIT_TOOL = {
  type: "function",
  function: {
    name: "build_outfit",
    description:
      "Monta un LOOK completo y coordinado (prenda principal + capa + bolso + calzado + joya) de la tienda para una ocasión. Úsala cuando pidan un outfit, un look o 'qué me pongo'. Devuelve las piezas y el precio total.",
    parameters: {
      type: "object",
      properties: {
        base_category: {
          type: "string",
          enum: [...CATEGORIES],
          description:
            "Categoría de la pieza principal del look (normalmente 'vestidos'). Opcional.",
        },
        max_budget: {
          type: "number",
          description: "Presupuesto total aproximado para el look completo. Opcional.",
        },
        keywords: {
          type: "string",
          description:
            "Estilo u ocasión en palabras clave, ej. 'boda playa', 'festival'. Opcional.",
        },
      },
      required: [],
    },
  },
};

const toAssistantProduct = (p: {
  id: string;
  title: string;
  price: string;
  currency: string;
  originalPrice: string | null;
  imageUrl: string;
  category: string;
  source: string;
  discountPct: number | null;
  rating: string | null;
  ordersCount: number | null;
}): AssistantProduct => ({
  id: p.id,
  title: p.title,
  price: p.price,
  currency: p.currency,
  originalPrice: p.originalPrice,
  imageUrl: p.imageUrl,
  category: p.category,
  source: p.source,
  discountPct: p.discountPct,
  rating: p.rating,
  ordersCount: p.ordersCount,
});

/** Escoge la pieza más popular de una categoría dentro del presupuesto. */
async function pickPiece(
  category: Category,
  maxPrice: number | null,
  excludeIds: Set<string>,
  keywords: string[]
): Promise<AssistantProduct | null> {
  const conditions: (SQL | undefined)[] = [
    eq(products.isActive, true),
    eq(products.available, true),
    eq(products.category, category),
  ];
  if (maxPrice !== null) conditions.push(lte(products.price, maxPrice.toFixed(2)));
  if (keywords.length > 0) {
    conditions.push(or(...keywords.map((w) => ilike(products.title, `%${w}%`))));
  }
  let rows = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.clicks), desc(products.discountPct))
    .limit(6);
  // Si con las palabras clave no hay nada, relaja el filtro de texto.
  if (rows.length === 0 && keywords.length > 0) {
    const relaxed = conditions.slice(0, maxPrice !== null ? 4 : 3);
    rows = await db
      .select()
      .from(products)
      .where(and(...relaxed))
      .orderBy(desc(products.clicks))
      .limit(6);
  }
  const pick = rows.find((r) => !excludeIds.has(r.id));
  return pick ? toAssistantProduct(pick) : null;
}

/** Ensambla un outfit: pieza base + complementos, respetando el presupuesto. */
async function buildOutfit(args: {
  base_category?: string;
  max_budget?: number;
  keywords?: string;
}): Promise<{ pieces: AssistantProduct[]; total: number; currency: string }> {
  const base = CATEGORIES.includes(args.base_category as Category)
    ? (args.base_category as Category)
    : "vestidos";
  const budget =
    typeof args.max_budget === "number" && args.max_budget > 0
      ? args.max_budget
      : null;
  const words = (args.keywords ?? "")
    .split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3)
    .slice(0, 3);

  const wanted = [base, ...(OUTFIT_MATCHES[base] ?? OUTFIT_MATCHES.otros)];
  const used = new Set<string>();
  const pieces: AssistantProduct[] = [];
  // Presupuesto por pieza: reparto flexible del total entre ~4 piezas.
  const perPiece = budget !== null ? budget * 0.6 : null;

  for (const category of wanted) {
    if (pieces.length >= 4) break;
    const piece = await pickPiece(category, perPiece, used, pieces.length === 0 ? words : []);
    if (piece) {
      pieces.push(piece);
      used.add(piece.id);
    }
  }
  const total = pieces.reduce((sum, p) => sum + Number(p.price), 0);
  return { pieces, total, currency: pieces[0]?.currency ?? "EUR" };
}

/**
 * Punto único de entrada al modelo para todo el proyecto.
 *
 * La elección de proveedor y la cadena de reserva viven en lib/llm.ts, que
 * intenta primero los modelos GRATUITOS de OpenRouter y cae a NVIDIA si
 * ninguno responde. Aquí solo se adapta la forma del mensaje, que es la misma
 * en ambos por ser dialecto OpenAI.
 */
export async function callModel(
  messages: ApiMessage[],
  opts: { tools?: object[]; maxTokens?: number } = {}
): Promise<ApiMessage> {
  const message = await chat(messages as LlmMessage[], opts);
  return message as ApiMessage;
}



/** Sugerencias de seguimiento según el contexto (sin coste de IA). */
function followUps(hasProducts: boolean, builtOutfit: boolean): string[] {
  if (builtOutfit) {
    return [
      "Cámbiame el bolso por otro",
      "Enséñame una versión más barata",
      "¿Y para otra ocasión?",
    ];
  }
  if (hasProducts) {
    return [
      "Móntame un look completo con esto",
      "Enséñame opciones más baratas",
      "¿Con qué lo combino?",
    ];
  }
  return [
    "¿Qué me pongo para una boda en la playa?",
    "Busco un vestido boho por menos de 30 €",
    "Ideas para un festival",
  ];
}

export async function runAssistant(
  history: ChatMessage[]
): Promise<AssistantResult> {
  const messages: ApiMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const collected = new Map<string, AssistantProduct>();
  let builtOutfit = false;

  const finish = (reply: string): AssistantResult => ({
    reply,
    products: [...collected.values()].slice(0, MAX_PRODUCTS),
    suggestions: followUps(collected.size > 0, builtOutfit),
  });

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const message = await callModel(messages, {
      tools: [SEARCH_TOOL, ALIEXPRESS_TOOL, OUTFIT_TOOL],
    });

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return finish(
        message.content?.trim() ||
          "Lo siento, no he podido preparar una respuesta. ¿Puedes reformular tu pregunta?"
      );
    }

    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: message.tool_calls,
    });

    for (const call of message.tool_calls) {
      let results: AssistantProduct[] = [];
      let toolError: string | null = null;
      let outfitTotal: number | null = null;
      let outfitCurrency = "EUR";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // argumentos malformados: búsqueda sin filtros
      }
      try {
        if (call.function.name === "search_products") {
          results = await searchProducts(args);
        } else if (call.function.name === "search_aliexpress") {
          results = await searchAliexpressAndSave(args);
        } else if (call.function.name === "build_outfit") {
          const outfit = await buildOutfit(args);
          results = outfit.pieces;
          outfitTotal = outfit.total;
          outfitCurrency = outfit.currency;
          if (outfit.pieces.length >= 2) builtOutfit = true;
        } else {
          toolError = `herramienta desconocida: ${call.function.name}`;
        }
      } catch (error) {
        console.error("Error en herramienta del agente:", error);
        toolError =
          error instanceof ProviderError
            ? error.message
            : "error interno al buscar productos";
      }
      for (const p of results) collected.set(p.id, p);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        // Solo los campos que el modelo necesita para razonar (sin URLs).
        content: toolError
          ? JSON.stringify({ error: toolError })
          : JSON.stringify({
              ...(outfitTotal !== null
                ? { total_look: `${outfitTotal.toFixed(2)} ${outfitCurrency}` }
                : {}),
              productos: results.map((p) => ({
                titulo: p.title,
                precio: `${p.price} ${p.currency}`,
                categoria: p.category,
              })),
            }),
      });
    }
  }

  return finish(
    "Aquí tienes una selección de la tienda; échales un vistazo abajo."
  );
}
