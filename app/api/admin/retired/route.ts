import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteRetired, reviewRetired } from "@/lib/retired";

// Revisar todo el catálogo son ~11 llamadas a la API del proveedor.
export const maxDuration = 60;

/** Revisión: comprueba el catálogo contra el proveedor. No borra nada. */
export async function POST() {
  const report = await reviewRetired();
  return NextResponse.json(report);
}

const deleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

/** Borrado definitivo de las piezas confirmadas como retiradas. */
export async function DELETE(request: Request) {
  const parsed = deleteSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Se esperaba { ids: string[] } con UUIDs válidos" },
      { status: 400 }
    );
  }

  const result = await deleteRetired(parsed.data.ids);
  return NextResponse.json(result);
}
