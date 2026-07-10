/**
 * Comprueba que el envío de correo funciona de punta a punta.
 *
 *   npx tsx scripts/send-test-email.ts
 *
 * Manda la plantilla de bienvenida y un aviso interno. Con EMAIL_OVERRIDE_TO
 * definido, ambos acaban en ese buzón pase lo que pase. Requiere en el entorno:
 * RESEND_API_KEY, EMAIL_FROM y EMAIL_ADMIN (ver .env.example).
 */
import { config } from "dotenv";
// Next carga .env.local solo. Los scripts tienen que pedirlo explícitamente.
config({ path: ".env.local" });
config();
import { notifyAdmin, sendEmail } from "../lib/email";
import { welcomeEmail } from "../lib/email-templates";

const DESTINO = process.env.EMAIL_ADMIN;
if (!process.env.RESEND_API_KEY) throw new Error("falta RESEND_API_KEY");
if (!DESTINO) throw new Error("falta EMAIL_ADMIN");

const piezas = [
  {
    id: "demo-1",
    slug: "vestido-boho-crochet",
    title: "Vestido boho de crochet",
    price: "34.90",
    currency: "EUR",
    imageUrl: "https://ae01.alicdn.com/kf/S5f1f2b0e1a7f4a5f9c1e2b3d4e5f6a7b.jpg",
  },
  {
    id: "demo-2",
    slug: "kimono-flecos-arena",
    title: "Kimono de flecos color arena",
    price: "27.50",
    currency: "EUR",
    imageUrl: "https://ae01.alicdn.com/kf/S6a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d.jpg",
  },
];

async function main() {
  const welcome = welcomeEmail({
    to: "destinatario-de-prueba@example.com",
    profileName: "Boho Playero",
    tagline: "Tejidos que vuelan, crochet y tonos crudos.",
    products: piezas,
  });

  const a = await sendEmail(welcome);
  console.log("bienvenida:", a.sent ? `enviada id=${a.id}` : `FALLO ${a.error ?? a.skipped}`);

  const b = await notifyAdmin("Prueba de aviso interno", [
    "Si lees esto, los avisos del sistema llegan bien.",
    `Redirección activa: ${process.env.EMAIL_OVERRIDE_TO || "(ninguna)"}`,
  ]);
  console.log("aviso interno:", b.sent ? `enviado id=${b.id}` : `FALLO ${b.error ?? b.skipped}`);

  if (!a.sent || !b.sent) process.exit(1);
}

main();
