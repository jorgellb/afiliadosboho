import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Rutas privadas o de redirección sin valor para indexar.
        // OJO: /feed/ NO se bloquea aquí. Merchant Center descarga el feed con
        // Googlebot y respeta robots.txt, así que un Disallow rompería la
        // descarga. Para que no salga en las búsquedas, el feed responde con
        // la cabecera X-Robots-Tag: noindex.
        disallow: ["/admin", "/api/", "/go/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
