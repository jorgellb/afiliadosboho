import { and, asc, count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, type Product } from "@/lib/db/schema";
import { getProvider } from "@/lib/providers";
import { bumpCacheVersion } from "@/lib/cache";
import { removeProduct } from "@/lib/search/products";
import { sql as raw } from "@/lib/db/pool";

/**
 * Detección y limpieza de piezas retiradas del proveedor.
 *
 * POR QUÉ NO SE COMPRUEBA EL 404 DE LA URL: los enlaces que guardamos son de
 * afiliado y pasan por redirectores; una pieza retirada suele acabar en una
 * página "no encontrado" que responde 200, y AliExpress bloquea peticiones
 * automatizadas con frecuencia. El estado HTTP, por tanto, miente en ambos
 * sentidos. La pregunta que de verdad importa es otra: ¿sigue el proveedor
 * ofreciendo esta pieza por la API de afiliados? Si no la devuelve, el enlace
 * está muerto aunque la página responda 200, y viceversa.
 *
 * REGLA DE DOS AVISOS: una pieza solo se propone para borrar si la API no la
 * devuelve AHORA **y** ya estaba marcada como no disponible de una comprobación
 * anterior. Un fallo puntual de la API (o un rate limit) haría desaparecer
 * lotes enteros de una respuesta válida; sin esta regla, un mal día del
 * proveedor borraría el catálogo. La primera ausencia solo marca; la segunda
 * confirma.
 */

const BATCH = 20;

/**
 * Cuántas piezas se revisan por pasada.
 *
 * Medido: 202 piezas = 11 llamadas a la API = 13 s. La función tiene 60 s,
 * así que revisar un catálogo de 5000 de una vez (250 llamadas, ~295 s) se
 * quedaría siempre a medias y sin avisar. Con 400 por pasada se tarda ~26 s
 * y quedan márgenes; el botón se pulsa varias veces, o lo recorre el cron.
 */
const LOTE_POR_PASADA = 400;

export interface RetiredCandidate {
  id: string;
  title: string;
  slug: string | null;
  category: string;
  clicks: number;
  lastCheckedAt: Date;
}

export interface RetiredReport {
  /** Piezas comprobadas contra la API en ESTA pasada. */
  checked: number;
  /** Piezas activas en total, para saber cuánto queda por recorrer. */
  totalActive: number;
  /** True si el catálogo es mayor que una pasada y quedan piezas. */
  hasMore: boolean;
  /** Ausentes ahora y ya marcadas antes: se pueden borrar. */
  retired: RetiredCandidate[];
  /** Ausentes por primera vez: se marcan, se borran en la próxima revisión. */
  newlyMissing: RetiredCandidate[];
  /** Vuelven a estar disponibles tras haber fallado antes. */
  recovered: number;
  errors: string[];
}

function toCandidate(product: Product): RetiredCandidate {
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    category: product.category,
    clicks: product.clicks,
    lastCheckedAt: product.lastCheckedAt,
  };
}

/**
 * Comprueba el catálogo contra la API del proveedor. No borra nada: solo
 * clasifica y actualiza el estado de disponibilidad.
 */
export async function reviewRetired(limit = LOTE_POR_PASADA): Promise<RetiredReport> {
  // Se empieza por las MENOS comprobadas recientemente, igual que hace el
  // cron de precios. Así, pasadas sucesivas recorren el catálogo entero sin
  // repetir trabajo, y ninguna se pasa del límite de la función.
  const catalog = await db
    .select()
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(asc(products.lastCheckedAt))
    .limit(limit);

  const [{ value: totalActivos }] = await db
    .select({ value: count() })
    .from(products)
    .where(eq(products.isActive, true));

  const report: RetiredReport = {
    checked: 0,
    totalActive: totalActivos,
    hasMore: totalActivos > catalog.length,
    retired: [],
    newlyMissing: [],
    recovered: 0,
    errors: [],
  };

  // Se agrupa por proveedor: cada uno tiene su propia API.
  const bySource = new Map<string, Product[]>();
  for (const product of catalog) {
    const group = bySource.get(product.source) ?? [];
    group.push(product);
    bySource.set(product.source, group);
  }

  for (const [source, group] of bySource) {
    for (let i = 0; i < group.length; i += BATCH) {
      const batch = group.slice(i, i + BATCH);
      // Se guarda el producto entero, no solo el id: hace falta su bandera de
      // disponibilidad para poder RESTAURAR una pieza que vuelve al catálogo.
      let alive: Map<string, { available: boolean }>;
      try {
        const fetched = await getProvider(source as Product["source"]).getByIds(
          batch.map((p) => p.sourceProductId)
        );
        alive = new Map(fetched.map((p) => [p.sourceProductId, p]));
      } catch (error) {
        // Un lote fallido NO se interpreta como "todas retiradas": se anota y
        // se salta. Confundir un error de red con una retirada masiva es
        // exactamente el fallo que esta función debe evitar.
        report.errors.push(
          `${source} lote ${i / BATCH + 1}: ${
            error instanceof Error ? error.message : "error desconocido"
          }`
        );
        continue;
      }

      report.checked += batch.length;

      // Marca TODO el lote como comprobado, cambie o no su estado.
      //
      // Es lo que hace avanzar la paginación: la consulta ordena por
      // `lastCheckedAt`, así que si solo se actualizaran las piezas que
      // cambian, las que están bien conservarían su fecha antigua y cada
      // pasada volvería a revisar exactamente las mismas. El recorrido del
      // catálogo no progresaría nunca.
      await db
        .update(products)
        .set({ lastCheckedAt: new Date() })
        .where(
          inArray(
            products.id,
            batch.map((p) => p.id)
          )
        );

      for (const product of batch) {
        const fresh = alive.get(product.sourceProductId);

        if (fresh) {
          // Vuelve a estar en el proveedor: se le devuelve la disponibilidad,
          // o quedaría marcada para borrar en la próxima revisión pese a
          // estar viva.
          if (!product.available && fresh.available) {
            await db
              .update(products)
              .set({ available: true })
              .where(eq(products.id, product.id));
            report.recovered++;
          }
          continue;
        }

        if (product.available) {
          // Primera ausencia: se marca, no se propone borrar todavía.
          await db
            .update(products)
            .set({ available: false })
            .where(eq(products.id, product.id));
          report.newlyMissing.push(toCandidate(product));
        } else {
          // Ya venía marcada: ausencia confirmada en dos comprobaciones.
          report.retired.push(toCandidate(product));
        }
      }
    }
  }

  if (report.newlyMissing.length > 0 || report.recovered > 0) {
    await bumpCacheVersion();
  }
  return report;
}

export interface DeleteResult {
  deleted: number;
  skipped: string[];
}

/**
 * Borra definitivamente las piezas indicadas y limpia lo que cuelga de ellas.
 *
 * `product_embeddings` y `product_tryon_assets` guardan el id como TEXTO y no
 * tienen clave foránea, así que nadie las borra en cascada: sin esta limpieza
 * quedarían huérfanas y la búsqueda por imagen seguiría proponiendo piezas
 * inexistentes.
 *
 * `click_events` se conserva a propósito: es el histórico de atribución, y
 * perderlo falsearía los informes de origen de tráfico de meses anteriores.
 */
export async function deleteRetired(ids: string[]): Promise<DeleteResult> {
  if (ids.length === 0) return { deleted: 0, skipped: [] };

  // Solo se borra lo que sigue marcado como no disponible: si algo volvió a
  // estar en venta entre la revisión y la confirmación, se respeta.
  const target = await db
    .select({ id: products.id })
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.available, false)));

  const confirmed = target.map((row) => row.id);
  const skipped = ids.filter((id) => !confirmed.includes(id));
  if (confirmed.length === 0) return { deleted: 0, skipped };

  // Tablas fuera de Drizzle, por id en texto.
  await raw`DELETE FROM product_embeddings WHERE product_id = ANY(${confirmed})`;
  await raw`DELETE FROM product_tryon_assets WHERE product_id = ANY(${confirmed})`;

  const removed = await db
    .delete(products)
    .where(inArray(products.id, confirmed))
    .returning({ id: products.id });

  for (const row of removed) await removeProduct(row.id);
  await bumpCacheVersion();

  return { deleted: removed.length, skipped };
}
