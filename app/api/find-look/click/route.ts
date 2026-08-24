import { NextResponse } from "next/server";
import { sql } from "@/lib/db/pool";
import { z } from "zod";

const bodySchema = z.object({
  searchId: z.uuid(),
  productId: z.string().trim().min(1).max(120),
});

/** Registra qué producto de una búsqueda se clicó (sendBeacon). */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    await sql`
      UPDATE look_searches
      SET clicked_products = array_append(
        coalesce(clicked_products, '{}'), ${parsed.data.productId}
      )
      WHERE id = ${parsed.data.searchId}
    `;
  } catch (error) {
    console.error("Error registrando clic de búsqueda:", error);
  }
  return NextResponse.json({ ok: true });
}
