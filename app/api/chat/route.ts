import { NextResponse } from "next/server";
import { z } from "zod";
import { runAssistant } from "@/lib/assistant";
import { rateLimit } from "@/lib/cache";

export const maxDuration = 60;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(1000),
      })
    )
    .min(1)
    .max(12),
});

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anon";
  if (!(await rateLimit(`chat:${ip}`, 10, 60))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, espera un minuto." },
      { status: 429 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }
  const { messages } = parsed.data;
  if (messages[messages.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "El último mensaje debe ser del usuario" },
      { status: 400 }
    );
  }

  try {
    const result = await runAssistant(messages);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error en el asistente:", error);
    const message =
      error instanceof Error &&
      error.message.startsWith("Falta la variable de entorno")
        ? error.message
        : "El asistente no está disponible ahora mismo, inténtalo más tarde.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
