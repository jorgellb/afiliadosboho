import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { bumpCacheVersion } from "@/lib/cache";
import { buildFeedXml, getFeedStats } from "@/lib/feed";

export const maxDuration = 60;

const bodySchema = z.object({
  /** `refresh`: recalcula y valida. `set-brand`: rellena la marca vacía. */
  action: z.enum(["refresh", "set-brand"]).default("refresh"),
  brand: z.string().trim().min(1).max(70).optional(),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  try {
    let filled = 0;
    if (parsed.data.action === "set-brand") {
      const brand = parsed.data.brand;
      if (!brand) {
        return NextResponse.json({ error: "Escribe una marca" }, { status: 400 });
      }
      const rows = await db
        .update(products)
        .set({ brand, updatedAt: new Date() })
        .where(and(eq(products.isActive, true), isNull(products.brand)))
        .returning({ id: products.id });
      filled = rows.length;
    }

    // El feed se genera al vuelo: «actualizar» es comprobar que sale bien y
    // recontar. Se construye de verdad para que un fallo salte aquí y no en
    // Google. Y se sube la versión de caché por si el CDN guardaba una copia.
    const [{ count }, stats] = await Promise.all([buildFeedXml(), getFeedStats()]);
    await bumpCacheVersion();

    return NextResponse.json({
      ok: true,
      items: count,
      stats,
      filled,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error comprobando el feed:", error);
    return NextResponse.json(
      { error: "No se pudo generar el feed. Mira los registros." },
      { status: 500 }
    );
  }
}
