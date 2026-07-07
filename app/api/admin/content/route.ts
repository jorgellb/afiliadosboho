import { NextResponse } from "next/server";
import { generateArticles } from "@/lib/content";

export const maxDuration = 120;

/** Genera artículos de la revista pendientes (botón del dashboard). */
export async function POST() {
  try {
    const summary = await generateArticles(2);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Error generando artículos:", error);
    return NextResponse.json(
      { error: "No se pudieron generar los artículos" },
      { status: 500 }
    );
  }
}
