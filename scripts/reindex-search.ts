/**
 * Crea el índice de OpenSearch y vuelca el catálogo completo.
 *
 *   npx tsx scripts/reindex-search.ts
 *
 * Idempotente: se puede repetir cuantas veces haga falta. El índice se
 * recrea desde Postgres, que es la fuente de verdad, así que un índice
 * corrupto se arregla borrándolo y volviendo a ejecutar esto.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.OPENSEARCH_URL?.trim();
  if (!url) throw new Error("falta OPENSEARCH_URL en .env.local");

  // Import diferido: estos módulos leen variables de entorno al cargarse, y
  // dotenv tiene que haber corrido antes.
  const { getAllProductsForAdmin } = await import("@/lib/products");
  const { ensureIndex, reindexAll } = await import("@/lib/search/products");
  const { ping } = await import("@/lib/search/opensearch");

  const info = await ping();
  if (!info) throw new Error("no se puede hablar con OpenSearch; revisa OPENSEARCH_URL");
  console.log(`OpenSearch ${info.version} accesible.`);

  const created = await ensureIndex();
  console.log(created ? "Índice listo." : "AVISO: no se pudo asegurar el índice.");

  const products = await getAllProductsForAdmin();
  console.log(`Indexando ${products.length} productos…`);

  const sent = await reindexAll(products);
  console.log(
    sent > 0
      ? `✓ ${sent} productos indexados.`
      : "✗ El volcado falló; revisa los errores de arriba."
  );
  process.exit(sent > 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
