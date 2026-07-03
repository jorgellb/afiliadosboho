import type { Product, Source } from "@/lib/db/schema";
import { getProvider } from "@/lib/providers";
import { applyPriceRefresh, getStalestProducts } from "@/lib/products";
import { bumpCacheVersion } from "@/lib/cache";

const BATCH_SIZE = 40;

export interface RefreshSummary {
  checked: number;
  updated: number;
  unavailable: number;
  errors: string[];
}

/**
 * Refresca precio y disponibilidad de los productos menos recientemente
 * comprobados. Un fallo en un proveedor no bloquea al otro ni marca
 * productos como no disponibles (solo la ausencia en una respuesta válida).
 */
export async function refreshStalePrices(
  limit: number = BATCH_SIZE
): Promise<RefreshSummary> {
  const stale = await getStalestProducts(limit);
  const summary: RefreshSummary = {
    checked: 0,
    updated: 0,
    unavailable: 0,
    errors: [],
  };

  const bySource = new Map<Source, Product[]>();
  for (const product of stale) {
    const group = bySource.get(product.source) ?? [];
    group.push(product);
    bySource.set(product.source, group);
  }

  for (const [source, group] of bySource) {
    try {
      const fetched = await getProvider(source).getByIds(
        group.map((p) => p.sourceProductId)
      );
      const result = await applyPriceRefresh(group, fetched);
      summary.checked += group.length;
      summary.updated += result.updated;
      summary.unavailable += result.unavailable;
    } catch (error) {
      summary.errors.push(
        `${source}: ${error instanceof Error ? error.message : "error desconocido"}`
      );
    }
  }

  if (summary.checked > 0) await bumpCacheVersion();
  return summary;
}
