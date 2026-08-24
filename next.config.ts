import type { NextConfig } from "next";
import { COLLECTIONS } from "./lib/collections";

/**
 * Redirecciones de las URLs antiguas de categoría.
 *
 * Hasta ahora una categoría era un parámetro sobre la home
 * (`/?category=joyeria`): las nueve compartían el <title> de la portada, no
 * tenían H1 ni canónica, y aun así iban en el sitemap. Ahora cada una tiene su
 * URL descriptiva (`/joyeria-boho`), así que la antigua debe redirigir.
 *
 * Se emite 301 explícito en lugar del 308 que pone `permanent: true`. Google
 * los trata igual, pero 301 es el que esperan las herramientas de auditoría y
 * los clientes antiguos.
 *
 * Next reenvía la query original al destino, así que `?category=vestidos&min=20`
 * llega como `/vestidos-boho?category=vestidos&min=20`: el filtro de precio se
 * conserva y la página de colección ignora el `category` sobrante porque la
 * categoría la manda la ruta. La canónica apunta siempre a la URL limpia.
 */
const categoryRedirects = COLLECTIONS.map((collection) => ({
  source: "/",
  has: [
    {
      type: "query" as const,
      key: "category",
      value: collection.category,
    },
  ],
  destination: `/${collection.slug}`,
  statusCode: 301,
}));

const nextConfig: NextConfig = {
  async redirects() {
    return categoryRedirects;
  },
};

export default nextConfig;
