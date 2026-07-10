/**
 * Envío de correo con Resend (dominio bohochic.es verificado, región eu-west-1).
 *
 * Dos salvaguardas deliberadas:
 * - Si no hay `RESEND_API_KEY`, no revienta: registra y sigue. Así los entornos
 *   sin clave (build, pruebas) funcionan igual.
 * - Si hay `EMAIL_OVERRIDE_TO`, TODO el correo se redirige a esa dirección y el
 *   destinatario real se anota en el asunto. Evita escribir sin querer a
 *   personas reales mientras se prueba.
 */

const API = "https://api.resend.com/emails";

// Se leen en cada llamada, no al cargar el módulo: los scripts cargan el .env
// después de los imports, y una constante congelada dejaría la redirección de
// seguridad vacía (con el correo saliendo al destinatario real).
const from = () => process.env.EMAIL_FROM ?? "Boho Chic <hola@bohochic.es>";
const admin = () => process.env.EMAIL_ADMIN ?? "";
const override = () => process.env.EMAIL_OVERRIDE_TO ?? "";

export interface Mail {
  to: string;
  subject: string;
  html: string;
  /** Texto plano: mejora la entregabilidad y los lectores sin HTML. */
  text: string;
  headers?: Record<string, string>;
}

export interface MailResult {
  sent: boolean;
  id?: string;
  skipped?: "sin-clave";
  error?: string;
}

export async function sendEmail(mail: Mail): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[email] sin RESEND_API_KEY: no se envía «${mail.subject}»`);
    return { sent: false, skipped: "sin-clave" };
  }

  const redirect = override();
  const redirected = Boolean(redirect) && redirect !== mail.to;
  const to = redirect || mail.to;
  const subject = redirected ? `[para ${mail.to}] ${mail.subject}` : mail.subject;

  try {
    const response = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from(),
        to: [to],
        subject,
        html: mail.html,
        text: mail.text,
        ...(mail.headers ? { headers: mail.headers } : {}),
        // Las respuestas llegan al buzón de la tienda, no al remitente técnico.
        ...(admin() ? { reply_to: admin() } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`[email] Resend ${response.status}: ${detail.slice(0, 300)}`);
      return { sent: false, error: `${response.status}` };
    }
    const data = (await response.json()) as { id?: string };
    return { sent: true, id: data.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    console.error("[email] fallo de red:", message);
    return { sent: false, error: message };
  }
}

/** Aviso interno a la tienda. Nunca falla hacia fuera. */
export async function notifyAdmin(subject: string, lines: string[]): Promise<MailResult> {
  const to = admin();
  if (!to) return { sent: false, error: "sin EMAIL_ADMIN" };
  const html = `<div style="font:15px/1.6 -apple-system,Segoe UI,sans-serif;color:#3f382e">
    <h2 style="font-weight:600">${escapeHtml(subject)}</h2>
    <ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
  </div>`;
  return sendEmail({
    to,
    subject,
    html,
    text: `${subject}\n\n${lines.join("\n")}`,
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
