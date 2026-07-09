/**
 * Renderizador de markdown mínimo y seguro para los artículos generados por
 * IA. Escapa todo el HTML primero y luego aplica solo un subconjunto:
 * encabezados ##/###, párrafos, listas, **negrita** y enlaces http(s).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(text: string): string {
  let out = escapeHtml(text);
  // Enlaces [texto](url): http(s) externos o rutas internas ("/…").
  out = out.replace(
    /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g,
    (_m, label, url: string) => {
      const rel = url.startsWith("/") ? "" : ' rel="noopener"';
      return `<a href="${url}"${rel}>${label}</a>`;
    }
  );
  // Negrita **texto**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

export function renderMarkdown(md: string): string {
  const blocks = md.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const html: string[] = [];

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    if (block.startsWith("### ")) {
      html.push(`<h3>${inline(block.slice(4))}</h3>`);
    } else if (block.startsWith("## ")) {
      html.push(`<h2>${inline(block.slice(3))}</h2>`);
    } else if (block.startsWith("# ")) {
      html.push(`<h2>${inline(block.slice(2))}</h2>`);
    } else if (/^[-*] /.test(block)) {
      const items = block
        .split("\n")
        .filter((l) => /^[-*] /.test(l.trim()))
        .map((l) => `<li>${inline(l.trim().slice(2))}</li>`)
        .join("");
      html.push(`<ul>${items}</ul>`);
    } else {
      html.push(`<p>${inline(block.replace(/\n/g, " "))}</p>`);
    }
  }
  return html.join("\n");
}
