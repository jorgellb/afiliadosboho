import type { MetadataRoute } from "next";
import { CATEGORIES } from "@/lib/db/schema";
import { getProductsForSitemap } from "@/lib/products";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getProductsForSitemap().catch(() => []);
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/asistente`, changeFrequency: "monthly", priority: 0.5 },
    ...CATEGORIES.filter((c) => c !== "otros").map((c) => ({
      url: `${SITE_URL}/?category=${c}`,
      changeFrequency: "daily" as const,
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
