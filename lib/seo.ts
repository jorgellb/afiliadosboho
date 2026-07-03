import { eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { Product, products } from "@/lib/db/schema";
import { callModel } from "@/lib/assistant";
import { bumpCacheVersion } from "@/lib/cache";

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
}

async function writeSeoCopy(product: Product): Promise<SeoCopy> {
  const message = await callModel(
    [
      {
        role: "user",
        content: `Eres redactor SEO senior de "Boho Chic", una tienda online de moda bohemia en español.
Escribe la ficha SEO del siguiente producto. Responde SOLO con este JSON, sin texto extra:
{
  "titulo": "título comercial claro y natural, 40-60 caracteres, la palabra clave principal al inicio, sin nombre del vendedor ni MAYÚSCULAS gritonas",
  "meta_title": "máximo 60 caracteres incluyendo el sufijo obligatorio ' | Boho Chic'",
  "meta_description": "entre 140 y 155 caracteres: beneficio concreto + gancho + llamada a la acción; sin comillas dobles",
  "descripcion": "60-90 palabras en 2 párrafos cortos, tono editorial cercano; describe estilo, ocasiones de uso y cómo combinarla; NO inventes tallas, materiales ni datos que no estén en el título original"
}

Producto:
- Título original: ${product.title}
- Categoría: ${product.category}
- Precio: ${product.price} ${product.currency}
- Tienda: ${product.source}`,
      },
    ],
    { maxTokens: 4096 }
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
  return {
    titulo: parsed.titulo.trim().slice(0, 80),
    meta_title: parsed.meta_title.trim().slice(0, 70),
    meta_description: parsed.meta_description.trim().slice(0, 170),
    descripcion: parsed.descripcion.trim().slice(0, 1200),
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
export async function generateSeoForProduct(product: Product): Promise<void> {
  const copy = await writeSeoCopy(product);
  const slug = await uniqueSlug(copy.titulo, product.id);
  await db
    .update(products)
    .set({
      slug,
      seoTitle: copy.titulo,
      seoDescription: copy.descripcion,
      metaTitle: copy.meta_title,
      metaDescription: copy.meta_description,
      updatedAt: sql`now()`,
    })
    .where(eq(products.id, product.id));
}

/** Genera fichas para los productos que aún no tienen (lotes pequeños). */
export async function generateMissingSeo(limit: number = 6): Promise<SeoSummary> {
  const pending = await db
    .select()
    .from(products)
    .where(isNull(products.seoTitle))
    .limit(Math.min(Math.max(limit, 1), 10));

  const summary: SeoSummary = { generated: 0, errors: [] };
  for (const product of pending) {
    try {
      await generateSeoForProduct(product);
      summary.generated++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "error";
      summary.errors.push(`${product.title.slice(0, 40)}…: ${message}`);
      // Con el límite de peticiones alcanzado, insistir solo suma fallos.
      if (message.includes("429")) break;
    }
  }
  if (summary.generated > 0) await bumpCacheVersion();
  return summary;
}
