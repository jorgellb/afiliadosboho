import type { Category } from "@/lib/db/schema";
import { collectionHref } from "@/lib/collections";

/**
 * Enlazado interno automático sobre texto plano.
 *
 * Los artículos ya convertían menciones de categoría en enlaces, pero las
 * fichas de producto no: su descripción menciona "combínalo con unas
 * sandalias" o "sobre un vestido largo" y todo eso quedaba en texto muerto.
 * Son cientos de oportunidades de enlace desperdiciadas, y crecerán con el
 * catálogo.
 *
 * Aquí se devuelven SEGMENTOS en lugar de HTML: la ficha renderiza texto
 * plano, no markdown, y montar HTML a mano para inyectarlo obligaría a
 * `dangerouslySetInnerHTML` sobre texto que escribe un modelo. Con segmentos,
 * React escapa todo por su cuenta.
 */

const CATEGORY_PATTERNS: Array<[RegExp, Category]> = [
  [/\bvestidos?\b/i, "vestidos"],
  [/\bkimonos?\b/i, "kimonos"],
  [/\bfaldas?\b/i, "faldas"],
  [/\bblusas?\b/i, "blusas"],
  [/\bpantalones?\b/i, "pantalones"],
  [/\bbolsos?\b/i, "bolsos"],
  [/\b(sandalias?|calzado|zapatos?|botas?)\b/i, "calzado"],
  [/\b(joyer[íi]a|collar(?:es)?|pendientes?|pulseras?)\b/i, "joyeria"],
  [/\b(accesorios?|sombreros?|cintur(?:ón|on)(?:es)?)\b/i, "accesorios"],
];

export interface Segment {
  text: string;
  /** Presente solo si el segmento es un enlace. */
  href?: string;
}

export interface LinkOptions {
  /** Tope de enlaces. Sobre-enlazar diluye el valor de cada uno. */
  max?: number;
  /**
   * Categoría a NO enlazar, normalmente la del propio producto: la miga de
   * pan ya lleva a su colección y repetirlo dentro del texto no aporta.
   */
  skip?: Category;
}

/**
 * Parte un texto en segmentos, convirtiendo en enlace la PRIMERA mención de
 * cada categoría. Solo la primera: enlazar las cinco veces que aparece
 * "vestido" en un párrafo es lo que Google entiende como sobre-optimización.
 */
export function linkCategories(
  text: string,
  options: LinkOptions = {}
): Segment[] {
  const max = options.max ?? 2;
  const segments: Segment[] = [];
  const used = new Set<Category>();
  let rest = text;
  let added = 0;

  while (added < max) {
    // De todas las categorías pendientes se toma la que aparece ANTES en el
    // texto, para no alterar el orden natural de lectura.
    let best: { index: number; length: number; category: Category } | null = null;

    for (const [pattern, category] of CATEGORY_PATTERNS) {
      if (used.has(category) || category === options.skip) continue;
      const match = pattern.exec(rest);
      if (!match) continue;
      if (best === null || match.index < best.index) {
        best = { index: match.index, length: match[0].length, category };
      }
    }
    if (!best) break;

    const before = rest.slice(0, best.index);
    const label = rest.slice(best.index, best.index + best.length);
    if (before) segments.push({ text: before });
    segments.push({ text: label, href: collectionHref(best.category) });

    rest = rest.slice(best.index + best.length);
    used.add(best.category);
    added++;
  }

  if (rest) segments.push({ text: rest });
  return segments;
}
