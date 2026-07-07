import { NextResponse } from "next/server";
import { z } from "zod";
import { addSubscriber } from "@/lib/products";
import { rateLimit } from "@/lib/cache";

const bodySchema = z.object({
  email: z.email().max(200),
  source: z.string().trim().max(40).default("newsletter"),
  styleResult: z.string().trim().max(80).nullish(),
});

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await rateLimit(`subscribe:${ip}`, 8, 60))) {
    return NextResponse.json(
      { error: "Demasiados intentos, espera un momento." },
      { status: 429 }
    );
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Introduce un email válido" },
      { status: 400 }
    );
  }
  try {
    await addSubscriber(
      parsed.data.email,
      parsed.data.source,
      parsed.data.styleResult ?? null
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error guardando suscriptor:", error);
    return NextResponse.json(
      { error: "No se pudo completar la suscripción" },
      { status: 500 }
    );
  }
}
