import { NextResponse } from "next/server";
import { generateMissingSeo } from "@/lib/seo";

export const maxDuration = 120;

/** Genera fichas SEO pendientes (botón del dashboard admin). */
export async function POST() {
  try {
    const summary = await generateMissingSeo(8);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Error generando fichas SEO:", error);
    return NextResponse.json(
      { error: "No se pudieron generar las fichas SEO" },
      { status: 500 }
    );
  }
}
