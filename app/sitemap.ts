import type { MetadataRoute } from "next";
import { CATEGORIES } from "@/lib/db/schema";
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
    ...CATEGORIES.filter((c) => c !== "otros").map((c) => ({
      url: `${SITE_URL}/?category=${c}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
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
