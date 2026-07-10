import { escapeHtml, Mail } from "@/lib/email";
import { LEGAL } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

/**
 * Correo de bienvenida al test de estilo. Cumple la promesa del formulario
 * («recibe esta selección»), que hasta ahora no se enviaba.
 */

export interface EmailProduct {
  slug: string | null;
  id: string;
  title: string;
  price: string;
  currency: string;
  imageUrl: string;
}

const INK = "#3f382e";
const SOFT = "#857a68";
const LINE = "#e4dbca";
const TERRACOTTA = "#c2704e";

function money(price: string, currency: string): string {
  return new Intl.NumberFormat("es", { style: "currency", currency }).format(
    Number(price)
  );
}

function productCell(p: EmailProduct): string {
  const href = `${SITE_URL}/producto/${p.slug ?? p.id}`;
  return `<td width="50%" style="padding:8px;vertical-align:top">
    <a href="${href}" style="text-decoration:none;color:${INK}">
      <img src="${escapeHtml(p.imageUrl)}" width="240" alt="${escapeHtml(p.title)}" style="width:100%;max-width:240px;border-radius:12px;display:block">
      <div style="font:600 14px/1.4 Georgia,serif;margin:8px 0 2px">${escapeHtml(p.title)}</div>
      <div style="font:14px/1.4 Arial,sans-serif;color:${TERRACOTTA}">${money(p.price, p.currency)}</div>
    </a>
  </td>`;
}

export function welcomeEmail(params: {
  to: string;
  profileName: string;
  tagline: string;
  products: EmailProduct[];
}): Mail {
  const { to, profileName, tagline, products } = params;
  const unsubscribe = `mailto:${LEGAL.email}?subject=Baja%20del%20boletin`;

  const rows: string[] = [];
  for (let i = 0; i < products.length; i += 2) {
    rows.push(`<tr>${products.slice(i, i + 2).map(productCell).join("")}</tr>`);
  }

  const html = `<div style="background:#f7f2e9;padding:28px 12px">
  <div style="max-width:560px;margin:0 auto;background:#fcf9f2;border:1px solid ${LINE};border-radius:18px;padding:28px 24px">
    <div style="font:600 26px/1.1 Georgia,serif;color:${INK};text-align:center">Boho Chic</div>
    <p style="font:13px/1.5 Arial,sans-serif;color:${SOFT};text-align:center;margin:6px 0 26px">Tu estilo, en una selección</p>

    <h1 style="font:600 24px/1.25 Georgia,serif;color:${INK};margin:0 0 10px">Eres ${escapeHtml(profileName)}</h1>
    <p style="font:15px/1.65 Arial,sans-serif;color:${SOFT};margin:0 0 22px">${escapeHtml(tagline)}</p>

    ${
      products.length
        ? `<p style="font:600 13px/1.4 Arial,sans-serif;color:#6f7d5e;margin:0 0 8px">Elegido para ti</p>
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows.join("")}</table>`
        : ""
    }

    <p style="text-align:center;margin:28px 0 8px">
      <a href="${SITE_URL}" style="display:inline-block;background:${TERRACOTTA};color:#fff;text-decoration:none;font:600 15px/1 Arial,sans-serif;padding:14px 26px;border-radius:999px">Explorar la tienda</a>
    </p>

    <hr style="border:none;border-top:1px solid ${LINE};margin:26px 0 14px">
    <p style="font:12px/1.6 Arial,sans-serif;color:${SOFT};margin:0 0 6px">
      Recibes este correo porque pediste tu selección en el test de estilo de bohochic.es.
      <a href="${unsubscribe}" style="color:${SOFT}">Darse de baja</a>.
    </p>
    <p style="font:12px/1.6 Arial,sans-serif;color:${SOFT};margin:0">
      ${escapeHtml(LEGAL.owner)} · ${escapeHtml(LEGAL.address)} ·
      <a href="${SITE_URL}/privacidad" style="color:${SOFT}">Política de privacidad</a>
    </p>
  </div>
</div>`;

  const text = `Eres ${profileName}

${tagline}

${products.map((p) => `- ${p.title} — ${money(p.price, p.currency)}\n  ${SITE_URL}/producto/${p.slug ?? p.id}`).join("\n")}

Explorar la tienda: ${SITE_URL}

Recibes este correo porque pediste tu selección en el test de estilo de bohochic.es.
Darse de baja: ${LEGAL.email}
${LEGAL.owner} · ${LEGAL.address}
Privacidad: ${SITE_URL}/privacidad`;

  return {
    to,
    subject: `Tu estilo boho: ${profileName}`,
    html,
    text,
    // Gmail y Outlook penalizan el correo masivo sin baja en un clic.
    headers: { "List-Unsubscribe": `<${unsubscribe}>` },
  };
}
