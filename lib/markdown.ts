/**
 * Renderizador de markdown mínimo y seguro para los artículos. Escapa todo el
 * HTML primero y luego aplica solo un subconjunto: encabezados ##/###,
 * párrafos, listas, citas, **negrita**, *cursiva*, enlaces http(s) o internos
 * e imágenes ![alt](url) con su texto alternativo.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Las comillas se escapan para que una URL no pueda salirse del atributo.
    .replace(/"/g, "&quot;");
}

function inline(text: string): string {
  let out = escapeHtml(text);
  // Imágenes ![alt](url). Antes que los enlaces: comparten la sintaxis.
  out = out.replace(
    /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, alt: string, url: string) =>
      `<img src="${url}" alt="${alt}" loading="lazy" />`
  );
  // Enlaces [texto](url): http(s) externos o rutas internas ("/…").
  out = out.replace(
    /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g,
    (_m, label, url: string) => {
      const rel = url.startsWith("/") ? "" : ' rel="noopener"';
      return `<a href="${url}"${rel}>${label}</a>`;
    }
  );
  // Negrita antes que cursiva, o la cursiva se comería los asteriscos dobles.
  // El interior admite asteriscos sueltos: hay negritas con cursiva dentro.
  out = out.replace(/\*\*((?:[^*]|\*(?!\*))+)\*\*/g, "<strong>$1</strong>");
  // Cursiva *texto*, ya sea suelta o dentro de una negrita ya convertida.
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
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
    } else if (/^> /.test(block)) {
      const text = block
        .split("\n")
        .map((l) => l.trim().replace(/^> ?/, ""))
        .join(" ");
      html.push(`<blockquote>${inline(text)}</blockquote>`);
    } else if (/^[-*] /.test(block)) {
      const items = block
        .split("\n")
        .filter((l) => /^[-*] /.test(l.trim()))
        .map((l) => `<li>${inline(l.trim().slice(2))}</li>`)
        .join("");
      html.push(`<ul>${items}</ul>`);
    } else if (/^!\[[^\]]*\]\(https?:\/\/[^\s)]+\)$/.test(block)) {
      // Imagen sola en su párrafo: figura a ancho completo, sin <p> alrededor.
      html.push(`<figure>${inline(block)}</figure>`);
    } else {
      html.push(`<p>${inline(block.replace(/\n/g, " "))}</p>`);
    }
  }
  return html.join("\n");
}

/** Palabras y minutos de lectura, para el editor. */
export function readingStats(md: string): { words: number; minutes: number } {
  const words = md.trim().split(/\s+/).filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.round(words / 200)) };
}
