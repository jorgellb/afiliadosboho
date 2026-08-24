import { curateCatalog, type CurateSummary } from "@/lib/curator";
import { generateMissingSeo, type SeoSummary } from "@/lib/seo";
import { reindexAll } from "@/lib/search/products";
import { getAllProductsForAdmin } from "@/lib/products";
import { isSearchConfigured } from "@/lib/search/opensearch";
import { llmChain } from "@/lib/llm";

/**
 * Pipeline diario de catálogo.
 *
 * Encadena en una sola pasada lo que antes eran tres acciones sueltas y a
 * ritmos distintos: buscar piezas nuevas de TODAS las categorías, redactar sus
 * fichas SEO, y dejarlas buscables. Antes la curación era semanal y las fichas
 * se redactaban a razón de 5 al día, así que un producto podía pasar días en
 * el catálogo sin título propio ni descripción — visible, indexable y vacío.
 *
 * El orden importa: primero entran las piezas, luego se redactan las fichas de
 * lo que falte (incluidas las que arrastraran deuda de días anteriores), y al
 * final se reindexa para que el buscador vea los títulos nuevos y no los
 * originales de AliExpress.
 *
 * El enlazado interno NO se genera aquí: se aplica al renderizar, en
 * lib/internal-links.ts. Guardar enlaces dentro del texto los congelaría, y
 * cambiar una URL obligaría a reescribir el catálogo entero — que es
 * exactamente el problema que dejó enlaces a `/?category=` cuando migramos.
 */

export interface PipelineSummary {
  catalog: CurateSummary;
  seo: SeoSummary;
  /** Documentos reindexados en el buscador, o null si no está configurado. */
  reindexed: number | null;
  /** Cadena de proveedores de IA utilizada, para diagnóstico. */
  llm: string[];
  errors: string[];
}

export interface PipelineOptions {
  /** Piezas nuevas por categoría. */
  perCategory?: number;
  /** Tope de fichas SEO a redactar en esta pasada. */
  seoLimit?: number;
}

export async function runDailyPipeline(
  options: PipelineOptions = {}
): Promise<PipelineSummary> {
  const perCategory = options.perCategory ?? 3;
  const seoLimit = options.seoLimit ?? 30;

  const summary: PipelineSummary = {
    catalog: { added: {}, totalAdded: 0, errors: [] },
    seo: { generated: 0, errors: [] },
    reindexed: null,
    llm: llmChain(),
    errors: [],
  };

  // 1. Piezas nuevas de todas las categorías.
  try {
    summary.catalog = await curateCatalog({ perCategory });
  } catch (error) {
    summary.errors.push(
      `curación: ${error instanceof Error ? error.message : "error"}`
    );
  }

  // 2. Fichas SEO. Se piden aunque la curación falle: puede haber deuda
  //    acumulada de días anteriores esperando.
  try {
    summary.seo = await generateMissingSeo(seoLimit);
  } catch (error) {
    summary.errors.push(
      `fichas SEO: ${error instanceof Error ? error.message : "error"}`
    );
  }

  // 3. Reindexado, solo si entró algo. Reindexar sin cambios sería gastar
  //    tiempo de función a cambio de nada.
  const huboCambios =
    summary.catalog.totalAdded > 0 || summary.seo.generated > 0;
  if (huboCambios && isSearchConfigured()) {
    try {
      summary.reindexed = await reindexAll(await getAllProductsForAdmin());
    } catch (error) {
      summary.errors.push(
        `reindexado: ${error instanceof Error ? error.message : "error"}`
      );
    }
  }

  return summary;
}
