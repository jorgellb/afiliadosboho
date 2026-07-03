import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Rutas privadas o de redirección sin valor para indexar.
        disallow: ["/admin", "/api/", "/go/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
