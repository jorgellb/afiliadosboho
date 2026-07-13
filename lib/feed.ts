import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { Category, Product, products } from "@/lib/db/schema";
import { SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * Feed de productos en el formato de Google Merchant Center (RSS 2.0 con el
 * espacio de nombres `g:`). El mismo archivo lo aceptan también los catálogos
 * de Meta y de Pinterest.
 *
 * ⚠️ Política de Google: no se permiten enlaces de afiliado en Shopping ads ni
 * en las fichas gratuitas, salvo participando como Comparison Shopping Service
 * (CSS). El `link` de cada producto apunta a nuestra ficha (bohochic.es), no al
 * enlace de afiliado, pero desde ahí se sale a un tercero para comprar: subirlo
 * a Merchant Center sin un CSS expone la cuenta a suspensión. Ver /admin/feed.
 */

/** Categorías de la taxonomía de Google (IDs oficiales). */
const GOOGLE_CATEGORY: Record<Category, { id: number; label: string }> = {
  vestidos: { id: 2271, label: "Apparel & Accessories > Clothing > Dresses" },
  blusas: { id: 212, label: "Apparel & Accessories > Clothing > Shirts & Tops" },
  faldas: { id: 1604, label: "Apparel & Accessories > Clothing > Skirts" },
  pantalones: { id: 204, label: "Apparel & Accessories > Clothing > Pants" },
  kimonos: { id: 5344, label: "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets" },
  accesorios: { id: 166, label: "Apparel & Accessories > Clothing Accessories" },
  bolsos: { id: 6551, label: "Apparel & Accessories > Handbags, Wallets & Cases > Handbags" },
  calzado: { id: 187, label: "Apparel & Accessories > Shoes" },
  joyeria: { id: 188, label: "Apparel & Accessories > Jewelry" },
  otros: { id: 166, label: "Apparel & Accessories > Clothing Accessories" },
};

export interface FeedIssue {
  /** `error`: Google rechazará el producto. `warning`: lo acepta con peor rendimiento. */
  level: "error" | "warning";
  field: string;
  message: string;
}

export interface FeedEntry {
  product: Product;
  issues: FeedIssue[];
  /** Sin errores: entra en el feed. */
  eligible: boolean;
}

export interface FeedStats {
  total: number;
  eligible: number;
  withErrors: number;
  withWarnings: number;
  excluded: number;
  /** Recuento por tipo de incidencia, para el panel. */
  byIssue: Array<{ field: string; level: FeedIssue["level"]; message: string; count: number }>;
}

/** Enlace público de la ficha (nunca el enlace de afiliado: lo prohíbe Google). */
export function productLink(product: Product): string {
  return `${SITE_URL}/producto/${product.slug ?? product.id}`;
}

/** Descripción: la editorial del agente SEO si existe; si no, la del proveedor. */
function description(product: Product): string {
  return (product.seoDescription ?? product.description ?? "").trim();
}

function title(product: Product): string {
  return (product.seoTitle ?? product.title).trim();
}

/** Comprueba un producto contra los requisitos de Google para ropa en España. */
export function validate(product: Product): FeedIssue[] {
  const issues: FeedIssue[] = [];
  const desc = description(product);

  if (!product.slug) {
    issues.push({
      level: "error",
      field: "link",
      message: "Sin ficha SEO: el producto no tiene URL propia. Genera la ficha desde Productos.",
    });
  }
  if (title(product).length > 150) {
    issues.push({ level: "error", field: "title", message: "El título pasa de 150 caracteres." });
  }
  if (!desc) {
    issues.push({
      level: "error",
      field: "description",
      message: "Sin descripción. Genera la ficha SEO del producto.",
    });
  } else if (desc.length < 30) {
    issues.push({ level: "warning", field: "description", message: "Descripción muy corta (menos de 30 caracteres)." });
  }
  if (Number(product.price) <= 0) {
    issues.push({ level: "error", field: "price", message: "Precio inválido." });
  }
  // Google exige marca en ropa, pero AliExpress casi nunca la da. En vez de
  // dejar el producto fuera del feed, se envía la de la tienda y se avisa.
  if (!product.brand) {
    issues.push({
      level: "warning",
      field: "brand",
      message: `Sin marca propia: se envía «${SITE_NAME}». Pon la marca real si la conoces.`,
    });
  }
  // Sin GTIN ni MPN hay que declarar `identifier_exists: no`, y Google lo acepta
  // solo si además hay marca. Se avisa, pero no impide el feed.
  if (!product.gtin) {
    issues.push({
      level: "warning",
      field: "gtin",
      message: "Sin código de barras: se envía identifier_exists=no (rinde peor).",
    });
  }
  if (!product.color) {
    issues.push({ level: "warning", field: "color", message: "Sin color: recomendado en ropa." });
  }
  if (!product.size && product.category !== "joyeria" && product.category !== "bolsos") {
    issues.push({ level: "warning", field: "size", message: "Sin talla: recomendado en prendas." });
  }
  return issues;
}

/**
 * Escapa el texto para XML y quita los caracteres de control, que invalidan el
 * archivo entero y los títulos de AliExpress los cuelan de vez en cuando.
 * Se filtra por código (no con una clase de regex) para no meter en el fuente
 * los propios caracteres que se quieren eliminar.
 */
export function escapeXml(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    // Permitidos por la especificación XML: tab (9), salto (10) y retorno (13).
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else if (ch === "'") out += "&apos;";
    else out += ch;
  }
  return out;
}

/** Todos los productos candidatos, con sus incidencias. */
export async function getFeedEntries(): Promise<FeedEntry[]> {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), eq(products.feedExcluded, false)));

  return rows.map((product) => {
    const issues = validate(product);
    return {
      product,
      issues,
      eligible: !issues.some((i) => i.level === "error"),
    };
  });
}

export async function getFeedStats(): Promise<FeedStats> {
  const [entries, excludedRows] = await Promise.all([
    getFeedEntries(),
    db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.isActive, true), eq(products.feedExcluded, true))),
  ]);

  const counter = new Map<string, { field: string; level: FeedIssue["level"]; message: string; count: number }>();
  for (const entry of entries) {
    for (const issue of entry.issues) {
      const key = `${issue.level}:${issue.field}`;
      const current = counter.get(key);
      if (current) current.count++;
      else counter.set(key, { ...issue, count: 1 });
    }
  }

  return {
    total: entries.length + excludedRows.length,
    eligible: entries.filter((e) => e.eligible).length,
    withErrors: entries.filter((e) => e.issues.some((i) => i.level === "error")).length,
    withWarnings: entries.filter((e) => e.eligible && e.issues.length > 0).length,
    excluded: excludedRows.length,
    byIssue: [...counter.values()].sort((a, b) => b.count - a.count),
  };
}

function item(product: Product): string {
  const g = GOOGLE_CATEGORY[product.category];
  const parts: string[] = [
    `<g:id>${escapeXml(product.id)}</g:id>`,
    `<g:title>${escapeXml(title(product).slice(0, 150))}</g:title>`,
    `<g:description>${escapeXml(description(product).slice(0, 5000))}</g:description>`,
    `<g:link>${escapeXml(productLink(product))}</g:link>`,
    `<g:image_link>${escapeXml(product.imageUrl)}</g:image_link>`,
    `<g:availability>${product.available ? "in_stock" : "out_of_stock"}</g:availability>`,
    `<g:price>${Number(product.price).toFixed(2)} ${escapeXml(product.currency)}</g:price>`,
    `<g:condition>new</g:condition>`,
    `<g:google_product_category>${g.id}</g:google_product_category>`,
    `<g:product_type>${escapeXml(product.category)}</g:product_type>`,
    // Catálogo de moda femenina de adulto: es lo que se vende, no una suposición.
    `<g:gender>female</g:gender>`,
    `<g:age_group>adult</g:age_group>`,
  ];

  // Precio rebajado: `price` es el original y `sale_price` el actual.
  if (product.originalPrice && Number(product.originalPrice) > Number(product.price)) {
    parts[6] = `<g:price>${Number(product.originalPrice).toFixed(2)} ${escapeXml(product.currency)}</g:price>`;
    parts.push(
      `<g:sale_price>${Number(product.price).toFixed(2)} ${escapeXml(product.currency)}</g:sale_price>`
    );
  }

  // Sin marca propia se envía la de la tienda: Google la exige en ropa y el
  // proveedor casi nunca la da. El panel lo avisa producto a producto.
  parts.push(`<g:brand>${escapeXml(product.brand ?? SITE_NAME)}</g:brand>`);
  if (product.gtin) parts.push(`<g:gtin>${escapeXml(product.gtin)}</g:gtin>`);
  else parts.push(`<g:identifier_exists>no</g:identifier_exists>`);
  if (product.color) parts.push(`<g:color>${escapeXml(product.color)}</g:color>`);
  if (product.size) parts.push(`<g:size>${escapeXml(product.size)}</g:size>`);

  return `    <item>\n      ${parts.join("\n      ")}\n    </item>`;
}

/** Construye el XML completo con los productos que pasan la validación. */
export async function buildFeedXml(): Promise<{ xml: string; count: number }> {
  const entries = await getFeedEntries();
  const eligible = entries.filter((e) => e.eligible);
  const items = eligible.map((e) => item(e.product)).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(SITE_NAME)}</title>
    <link>${escapeXml(SITE_URL)}</link>
    <description>Moda boho chic seleccionada a mano.</description>
${items}
  </channel>
</rss>
`;
  return { xml, count: eligible.length };
}

export const FEED_PATH = "/feed/google.xml";
export const FEED_URL = `${SITE_URL}${FEED_PATH}`;
export { GOOGLE_CATEGORY };
