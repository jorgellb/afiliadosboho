import { NextResponse, after } from "next/server";
import { z } from "zod";
import { addSubscriber, getProductsByProfile } from "@/lib/products";
import { rateLimit } from "@/lib/cache";
import { notifyAdmin, sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/email-templates";
import { PROFILES, ProfileKey } from "@/lib/quiz";

export const maxDuration = 30;

const bodySchema = z.object({
  email: z.email().max(200),
  source: z.string().trim().max(40).default("newsletter"),
  styleResult: z.string().trim().max(80).nullish(),
  profile: z.enum(["playero", "festival", "elegante", "cotidiano"]).nullish(),
});

/** Bienvenida al suscriptor y aviso a la tienda. Nunca tumba la respuesta. */
async function sendSubscriptionEmails(
  email: string,
  source: string,
  profile: ProfileKey | null
) {
  try {
    if (profile) {
      const { name, tagline, categories } = PROFILES[profile];
      // Sin tope de precio: el del test depende de las respuestas, no del perfil.
      const products = await getProductsByProfile(categories, null, 4);
      await sendEmail(
        welcomeEmail({ to: email, profileName: name, tagline, products })
      );
    }
    await notifyAdmin("Nueva suscripción en Boho Chic", [
      `Correo: ${email}`,
      `Origen: ${source}`,
      `Perfil: ${profile ? PROFILES[profile].name : "sin perfil"}`,
    ]);
  } catch (error) {
    console.error("[subscribe] fallo enviando correos:", error);
  }
}

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
  const { email, source, styleResult, profile } = parsed.data;
  try {
    const { isNew } = await addSubscriber(email, source, styleResult ?? null);
    // El correo sale tras responder: el formulario no espera a Resend. Solo en
    // altas nuevas, para no repetir la bienvenida a quien rehace el test.
    if (isNew) {
      after(() => sendSubscriptionEmails(email, source, profile ?? null));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error guardando suscriptor:", error);
    return NextResponse.json(
      { error: "No se pudo completar la suscripción" },
      { status: 500 }
    );
  }
}
