import { CATEGORIES, Category } from "@/lib/db/schema";
import { getProvider } from "@/lib/providers";
import { getSavedSourceIds, upsertProduct } from "@/lib/products";
import { callModel } from "@/lib/assistant";

/**
 * Curador de catálogo: el agente genera consultas de búsqueda por categoría,
 * busca en AliExpress y guarda los productos ya categorizados. Se dispara
 * desde el dashboard admin o desde el cron semanal.
 */

const CURATED_CATEGORIES = CATEGORIES.filter((c) => c !== "otros");
const DEFAULT_PER_CATEGORY = 3;

/** Consultas de reserva si el modelo no responde (saturación, JSON inválido…). */
const FALLBACK_QUERIES: Record<string, string[]> = {
  vestidos: ["vestido boho largo", "vestido bohemio playa"],
  blusas: ["blusa boho bordada", "top bohemio mujer"],
  faldas: ["falda larga boho", "falda bohemia estampada"],
  pantalones: ["pantalon ancho boho", "pantalon bohemio mujer"],
  kimonos: ["kimono boho playa", "kimono bohemio largo"],
  accesorios: ["cinturon boho mujer", "panuelo bohemio"],
  bolsos: ["bolso boho flecos", "bolso crochet playa"],
  calzado: ["sandalias boho mujer", "botas bohemias"],
  joyeria: ["collar boho capas", "pendientes bohemios"],
  otros: ["sombrero boho", "decoracion boho"],
};

export interface CurateSummary {
  added: Record<string, number>;
  totalAdded: number;
  errors: string[];
}

/** Pide al agente 2 consultas de búsqueda por categoría; JSON o fallback. */
async function generateQueries(
  categories: Category[]
): Promise<Record<string, string[]>> {
  try {
    const message = await callModel(
      [
        {
          role: "user",
          content: `Eres el comprador de una tienda de moda boho chic. Genera 2 consultas de búsqueda para AliExpress por categoría, en español, de 2 a 4 palabras, específicas del estilo boho (varía tejidos, ocasiones y detalles: crochet, flecos, bordados, playa, festival...).
Categorías: ${categories.join(", ")}.
Responde SOLO con un JSON así, sin texto adicional: {"vestidos": ["...", "..."], "faldas": ["...", "..."]}`,
        },
      ],
      { maxTokens: 4096 }
    );
    const raw = (message.content ?? "")
      .replace(/```json|```/g, "")
      .trim();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const queries: Record<string, string[]> = {};
    for (const category of categories) {
      const value = parsed[category];
      if (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((q) => typeof q === "string" && q.trim().length >= 3)
      ) {
        queries[category] = value.slice(0, 2).map((q) => q.trim());
      } else {
        queries[category] = FALLBACK_QUERIES[category];
      }
    }
    return queries;
  } catch (error) {
    console.error("Curador: usando consultas de reserva:", error);
    return Object.fromEntries(
      categories.map((c) => [c, FALLBACK_QUERIES[c]])
    );
  }
}

export async function curateCatalog(
  options: { categories?: Category[]; perCategory?: number } = {}
): Promise<CurateSummary> {
  const categories = (options.categories ?? CURATED_CATEGORIES).filter((c) =>
    CATEGORIES.includes(c)
  );
  const perCategory = Math.min(Math.max(options.perCategory ?? DEFAULT_PER_CATEGORY, 1), 6);

  const summary: CurateSummary = { added: {}, totalAdded: 0, errors: [] };
  if (categories.length === 0) return summary;

  const [queries, existingIds] = await Promise.all([
    generateQueries(categories),
    getSavedSourceIds("aliexpress"),
  ]);
  const provider = getProvider("aliexpress");

  for (const category of categories) {
    let added = 0;
    for (const query of queries[category] ?? []) {
      if (added >= perCategory) break;
      try {
        const results = await provider.search(query, 1);
        for (const result of results) {
          if (added >= perCategory) break;
          if (result.price === null || !result.available) continue;
          if (existingIds.has(result.sourceProductId)) continue;
          await upsertProduct(result, { category, tags: ["asistente", "curador"] });
          existingIds.add(result.sourceProductId);
          added++;
        }
      } catch (error) {
        summary.errors.push(
          `${category} ("${query}"): ${error instanceof Error ? error.message : "error desconocido"}`
        );
      }
    }
    summary.added[category] = added;
    summary.totalAdded += added;
  }
  return summary;
}
