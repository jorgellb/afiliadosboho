import type { MetadataRoute } from "next";
import { COLLECTIONS } from "@/lib/collections";
import { getProductsForSitemap } from "@/lib/products";
import { getPublishedArticles } from "@/lib/content";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, articles] = await Promise.all([
    getProductsForSitemap().catch(() => []),
    getPublishedArticles().catch(() => []),
  ]);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/quiz`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/revista`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/asistente`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacidad`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/cookies`, changeFrequency: "yearly", priority: 0.2 },
    // Colecciones con URL propia. Antes aquí iban las `/?category=X`, que
    // compartían title con la home y no tenían H1 ni canónica: mandar eso al
    // sitemap era pedirle a Google que indexara nueve duplicados de la portada.
    ...COLLECTIONS.map((c) => ({
      url: `${SITE_URL}/${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...articles.map((a) => ({
      url: `${SITE_URL}/revista/${a.slug}`,
      lastModified: a.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...products.map((p) => ({
      url: `${SITE_URL}/producto/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
