import { desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { Product, products } from "@/lib/db/schema";
import { chat } from "@/lib/llm";
import { SETTING_SEO_MODEL, getSetting } from "@/lib/settings";
import { bumpCacheVersion } from "@/lib/cache";

// Límites recomendados por los buscadores (para avisos y validación).
export const META_TITLE_MAX = 60;
export const META_DESC_MIN = 120;
export const META_DESC_MAX = 160;

/**
 * Redactor SEO: el agente escribe la ficha de cada producto — título
 * comercial optimizado, meta title, meta description y una descripción corta
 * de calidad — y se genera un slug único para la URL.
 */

export interface SeoSummary {
  generated: number;
  errors: string[];
}

/** Convierte un texto en slug de URL (sin acentos, guiones, máx. 70 chars). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
}

interface SeoCopy {
  titulo: string;
  meta_title: string;
  meta_description: string;
  descripcion: string;
  tags: string[];
}

export interface SeoGenOptions {
  /** Palabra/frase clave objetivo para orientar la redacción. */
  keyword?: string;
}

async function writeSeoCopy(
  product: Product,
  opts: SeoGenOptions = {}
): Promise<SeoCopy> {
  const keywordLine = opts.keyword
    ? `\n- Palabra clave OBJETIVO (debe aparecer literal en el título SEO y en la meta description): ${opts.keyword}`
    : "";
  const message = await chat(
    [
      {
        role: "user",
        content: `Eres redactor SEO senior de "Boho Chic", una tienda online de moda bohemia en español. Escribes para posicionar en Google y para convertir.

Reglas de calidad:
- Nada de relleno ni superlativos vacíos. Lenguaje natural, específico y comercial.
- NO inventes tallas, materiales, composición ni datos que no estén en el título original.
- No menciones tiendas, proveedores ni marcas de terceros.
- Respeta ESTRICTAMENTE los límites de caracteres (Google los recorta).

Responde SOLO con este JSON, sin texto extra:
{
  "titulo": "título comercial claro y natural, 45-65 caracteres, la palabra clave principal al inicio, sin MAYÚSCULAS gritonas",
  "meta_title": "máximo ${META_TITLE_MAX} caracteres EN TOTAL incluyendo el sufijo obligatorio ' | Boho Chic'",
  "meta_description": "entre ${META_DESC_MIN} y ${META_DESC_MAX} caracteres: beneficio concreto + gancho + llamada a la acción; sin comillas dobles",
  "descripcion": "60-90 palabras en 2 párrafos cortos, tono editorial cercano; describe estilo, ocasiones de uso y cómo combinarla",
  "tags": ["4-8 palabras clave en español, minúsculas, sin #, relevantes para búsqueda interna y para SEO (tipo de prenda, estilo, ocasión, color, detalle)"]
}

Producto:
- Título original: ${product.title}
- Categoría: ${product.category}
- Precio: ${product.price} ${product.currency}${keywordLine}`,
      },
    ],
    // El modelo elegido en el panel va primero; si falla, la cadena sigue
    // con los demas, para que una eleccion desafortunada no deje el
    // catalogo sin fichas.
    { maxTokens: 4096, preferredModel: await getSetting(SETTING_SEO_MODEL) }
  );
  const raw = (message.content ?? "").replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(raw) as Partial<SeoCopy>;
  if (
    !parsed.titulo ||
    !parsed.meta_title ||
    !parsed.meta_description ||
    !parsed.descripcion
  ) {
    throw new Error("ficha incompleta");
  }
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags
        .map((t) => String(t).trim().toLowerCase().replace(/^#/, ""))
        .filter((t) => t.length >= 2 && t.length <= 40)
        .slice(0, 8)
    : [];
  return {
    titulo: parsed.titulo.trim().slice(0, 80),
    meta_title: parsed.meta_title.trim().slice(0, 70),
    meta_description: parsed.meta_description.trim().slice(0, 170),
    descripcion: parsed.descripcion.trim().slice(0, 1200),
    tags,
  };
}

/** Slug único: si ya existe, se le añade un fragmento del id. */
async function uniqueSlug(base: string, productId: string): Promise<string> {
  const candidate = slugify(base) || `producto-${productId.slice(0, 8)}`;
  const clash = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, candidate))
    .limit(1);
  if (clash.length === 0 || clash[0].id === productId) return candidate;
  return `${candidate.slice(0, 60)}-${productId.slice(0, 6)}`;
}

/** Genera la ficha SEO de un producto concreto y la guarda. */
export async function generateSeoForProduct(
  product: Product,
  opts: SeoGenOptions = {}
): Promise<void> {
  const copy = await writeSeoCopy(product, opts);
  const slug = await uniqueSlug(copy.titulo, product.id);
  // Mezcla los tags nuevos con los existentes (sin duplicar), no los pierde.
  const mergedTags = [...new Set([...product.tags, ...copy.tags])].slice(0, 12);
  await db
    .update(products)
    .set({
      slug,
      seoTitle: copy.titulo,
      seoDescription: copy.descripcion,
      metaTitle: copy.meta_title,
      metaDescription: copy.meta_description,
      tags: mergedTags,
      updatedAt: sql`now()`,
    })
    .where(eq(products.id, product.id));
}

/** Genera solo tags/keywords para un producto (más rápido y barato). */
export async function generateTagsForProduct(product: Product): Promise<string[]> {
  const message = await chat(
    [
      {
        role: "user",
        content: `Genera entre 5 y 8 palabras clave de búsqueda en español para este producto de moda boho, en minúsculas y sin #. Tipo de prenda, estilo, ocasión, color y detalle. Responde SOLO con un array JSON de strings.
Producto: ${product.title} (categoría: ${product.category})`,
      },
    ],
    { maxTokens: 300, preferredModel: await getSetting(SETTING_SEO_MODEL) }
  );
  const raw = (message.content ?? "").replace(/```json|```/g, "").trim();
  const arr = JSON.parse(raw.slice(raw.indexOf("["))) as unknown[];
  const tags = arr
    .map((t) => String(t).trim().toLowerCase().replace(/^#/, ""))
    .filter((t) => t.length >= 2 && t.length <= 40);
  const merged = [...new Set([...product.tags, ...tags])].slice(0, 12);
  await db
    .update(products)
    .set({ tags: merged, updatedAt: sql`now()` })
    .where(eq(products.id, product.id));
  await bumpCacheVersion();
  return merged;
}

export interface SeoIssue {
  id: string;
  title: string;
  slug: string | null;
  detail: string;
}

export interface SeoHealth {
  total: number;
  withSeo: number;
  coverage: number; // 0-100
  counts: {
    missing: number;
    titleTooLong: number;
    descBadLength: number;
    noTags: number;
    duplicateMeta: number;
  };
  issues: {
    missing: SeoIssue[];
    titleTooLong: SeoIssue[];
    descBadLength: SeoIssue[];
    noTags: SeoIssue[];
    duplicateMeta: SeoIssue[];
  };
}

/** Auditoría SEO del catálogo: cobertura y problemas accionables. */
export async function getSeoHealth(): Promise<SeoHealth> {
  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      seoTitle: products.seoTitle,
      metaTitle: products.metaTitle,
      metaDescription: products.metaDescription,
      slug: products.slug,
      tags: products.tags,
    })
    .from(products)
    .orderBy(desc(products.createdAt));

  const health: SeoHealth = {
    total: rows.length,
    withSeo: 0,
    coverage: 0,
    counts: { missing: 0, titleTooLong: 0, descBadLength: 0, noTags: 0, duplicateMeta: 0 },
    issues: { missing: [], titleTooLong: [], descBadLength: [], noTags: [], duplicateMeta: [] },
  };

  const metaSeen = new Map<string, number>();
  for (const r of rows) {
    if (r.metaTitle) metaSeen.set(r.metaTitle, (metaSeen.get(r.metaTitle) ?? 0) + 1);
  }

  const push = (key: keyof SeoHealth["issues"], r: (typeof rows)[number], detail: string) => {
    health.counts[key]++;
    if (health.issues[key].length < 50) {
      health.issues[key].push({ id: r.id, title: r.seoTitle ?? r.title, slug: r.slug, detail });
    }
  };

  for (const r of rows) {
    if (!r.seoTitle) {
      push("missing", r, "sin ficha SEO");
      continue;
    }
    health.withSeo++;
    if (r.metaTitle && r.metaTitle.length > META_TITLE_MAX) {
      push("titleTooLong", r, `meta title ${r.metaTitle.length} car. (máx ${META_TITLE_MAX})`);
    }
    const dl = r.metaDescription?.length ?? 0;
    if (dl < META_DESC_MIN || dl > META_DESC_MAX) {
      push("descBadLength", r, `meta description ${dl} car. (ideal ${META_DESC_MIN}-${META_DESC_MAX})`);
    }
    if (!r.tags || r.tags.length === 0) {
      push("noTags", r, "sin tags/keywords");
    }
    if (r.metaTitle && (metaSeen.get(r.metaTitle) ?? 0) > 1) {
      push("duplicateMeta", r, "meta title duplicado");
    }
  }

  health.coverage = health.total > 0 ? Math.round((health.withSeo / health.total) * 100) : 0;
  return health;
}

/** Genera fichas para los productos que aún no tienen (lotes pequeños). */
/**
 * Redacta las fichas que faltan.
 *
 * El tope sube de 10 a 40: con curación DIARIA de las nueve categorías entran
 * ~27 piezas al día, así que un límite de 10 dejaría la deuda creciendo para
 * siempre y la mayoría del catálogo sin ficha. 40 cubre un día entero con
 * holgura. El freno real no es este número sino el 429 del proveedor de IA,
 * que corta el bucle en cuanto aparece.
 */
export async function generateMissingSeo(limit: number = 6): Promise<SeoSummary> {
  const pending = await db
    .select()
    .from(products)
    .where(isNull(products.seoTitle))
    .limit(Math.min(Math.max(limit, 1), 40));

  const summary: SeoSummary = { generated: 0, errors: [] };

  // EN PARALELO, por tandas. Medido: una ficha tarda ~33 s con el prompt real
  // (los modelos de razonamiento gastan buena parte pensando). En serie, 30
  // fichas son 16 minutos, contra un cron que dispone de 300 s: la promesa de
  // 30 al día era aritméticamente imposible. Con tandas de 4 bajan a ~4 min.
  //
  // La concurrencia se mantiene baja a propósito: el cupo gratuito de
  // OpenRouter ronda las 20 peticiones por minuto, y dispararlas todas de
  // golpe garantizaría el 429 que se intenta evitar.
  const CONCURRENCIA = 4;

  for (let i = 0; i < pending.length; i += CONCURRENCIA) {
    const tanda = pending.slice(i, i + CONCURRENCIA);
    const resultados = await Promise.allSettled(
      tanda.map((product) => generateSeoForProduct(product))
    );

    let limiteAlcanzado = false;
    resultados.forEach((resultado, j) => {
      if (resultado.status === "fulfilled") {
        summary.generated++;
        return;
      }
      const message =
        resultado.reason instanceof Error ? resultado.reason.message : "error";
      summary.errors.push(`${tanda[j].title.slice(0, 40)}…: ${message}`);
      if (message.includes("429")) limiteAlcanzado = true;
    });

    // Con el límite de peticiones alcanzado, seguir solo suma fallos.
    if (limiteAlcanzado) break;
  }

  if (summary.generated > 0) await bumpCacheVersion();
  return summary;
}
