/**
 * Variantes de imagen servidas por el CDN del proveedor.
 *
 * POR QUÉ NO SE USA next/image: el CDN de AliExpress ya redimensiona y ya
 * negocia el formato por sí solo. Comprobado sobre una imagen real del
 * catálogo:
 *
 *   original        1000x1000   558 KB jpeg / 156 KB webp / 78 KB avif
 *   _640x640.jpg     640x640    238 KB jpeg / 87 KB webp / 49 KB avif
 *   _480x480.jpg     480x480    146 KB jpeg / 56 KB webp / 33 KB avif
 *   _220x220.jpg     220x220     38 KB jpeg / 15 KB webp /  9 KB avif
 *
 * Es decir: el formato moderno lo sirve el CDN según el Accept del navegador,
 * y solo faltaba pedir el TAMAÑO adecuado. Hasta ahora la rejilla cargaba
 * imágenes de 1000x1000 para pintarlas a ~250 px.
 *
 * Pasar por el optimizador de Vercel habría consumido cuota de
 * transformaciones y CPU en cada miniatura — precisamente el recurso que
 * bloqueó la cuenta. Aquí el trabajo lo hace el CDN, gratis.
 */

/** Host del CDN del proveedor. Otras URLs se dejan intactas. */
const CDN_HOST_SUFFIX = "aliexpress-media.com";

/** Anchos disponibles, de menor a mayor. */
const WIDTHS = [220, 480, 640, 800] as const;

/** Ya lleva sufijo de tamaño: no se le encadena otro. */
const HAS_VARIANT = /_\d+x\d+\.(jpg|jpeg|png|webp)/i;

function isCdnImage(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(CDN_HOST_SUFFIX);
  } catch {
    return false;
  }
}

/** URL de la variante de un ancho dado. Devuelve la original si no aplica. */
export function variant(url: string, width: number): string {
  if (!isCdnImage(url) || HAS_VARIANT.test(url)) return url;
  return `${url}_${width}x${width}.jpg`;
}

export interface ResponsiveImage {
  src: string;
  srcSet?: string;
  sizes?: string;
}

/**
 * Atributos para una imagen adaptable.
 *
 * `sizes` debe describir el ancho al que se PINTA la imagen, no el del
 * archivo: es lo que usa el navegador para elegir del srcset antes de conocer
 * el layout. Un `sizes` mal puesto es peor que no ponerlo, porque hace
 * descargar la variante equivocada con total confianza.
 */
export function responsive(url: string, sizes: string): ResponsiveImage {
  if (!isCdnImage(url) || HAS_VARIANT.test(url)) return { src: url };

  return {
    // src apunta a un tamaño intermedio: es lo que usan los navegadores (o
    // rastreadores) que ignoran srcset.
    src: variant(url, 640),
    srcSet: WIDTHS.map((w) => `${variant(url, w)} ${w}w`).join(", "),
    sizes,
  };
}

/**
 * Anchos de pintado declarados, uno por contexto.
 *
 * La rejilla es `auto-fill` con columnas de mínimo 240 px, que a dos columnas
 * en móvil deja cada tarjeta a algo menos de la mitad del ancho de pantalla.
 */
export const SIZES = {
  /** Rejilla de producto: 2 columnas en móvil, hasta ~300 px en escritorio. */
  grid: "(max-width: 620px) 45vw, (max-width: 1000px) 30vw, 300px",
  /** Imagen principal de la ficha. */
  ficha: "(max-width: 900px) 92vw, 460px",
  /** Miniaturas pequeñas (chat, resultados de búsqueda por foto, panel). */
  thumb: "(max-width: 620px) 30vw, 180px",
  /** Collage de portada: la mitad del ancho en escritorio. */
  hero: "(max-width: 900px) 90vw, 520px",
} as const;
