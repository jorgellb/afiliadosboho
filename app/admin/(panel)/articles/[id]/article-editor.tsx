"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { renderMarkdown, readingStats } from "@/lib/markdown";

const CATEGORIES = [
  "vestidos", "blusas", "faldas", "pantalones", "kimonos",
  "accesorios", "bolsos", "calzado", "joyeria", "otros",
] as const;

export interface EditableArticle {
  id: string;
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  body: string;
  category: string;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  productIds: string[];
  published: boolean;
}

interface CatalogItem {
  id: string;
  title: string;
  imageUrl: string;
  category: string;
}

interface Props {
  article: EditableArticle;
  catalog: CatalogItem[];
  internalLinks: Array<{ label: string; href: string }>;
}

/** Rangos ideales para Google; fuera de ellos el contador avisa. */
const META_TITLE_MAX = 60;
const META_DESC_MIN = 140;
const META_DESC_MAX = 155;

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function ArticleEditor({ article, catalog, internalLinks }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<EditableArticle>(article);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState<"escribir" | "previsualizar">("escribir");
  const [linkOpen, setLinkOpen] = useState(false);
  const [imgOpen, setImgOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const set = <K extends keyof EditableArticle>(key: K, value: EditableArticle[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const stats = useMemo(() => readingStats(form.body), [form.body]);
  const preview = useMemo(() => renderMarkdown(form.body), [form.body]);
  const chosen = useMemo(
    () => form.productIds.map((id) => catalog.find((c) => c.id === id)).filter(Boolean) as CatalogItem[],
    [form.productIds, catalog]
  );
  const matches = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter((c) => !form.productIds.includes(c.id) && c.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [productQuery, catalog, form.productIds]);

  /** Envuelve o inserta texto en la posición del cursor del cuerpo. */
  function surround(before: string, after = "", placeholder = "texto") {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const selected = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + selected + after + value.slice(e);
    set("body", next);
    // Deja seleccionado lo insertado para poder seguir escribiendo encima.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  }

  /** Inserta al principio de cada línea seleccionada (encabezados, listas…). */
  function prefixLine(prefix: string) {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, value } = el;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    set("body", next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + prefix.length, s + prefix.length);
    });
  }

  function insertLink(label: string, href: string) {
    surround(`[${label}](${href})`, "", "");
    setLinkOpen(false);
  }

  function insertImage(url: string, alt: string) {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, value } = el;
    const snippet = `\n\n![${alt}](${url})\n\n`;
    set("body", value.slice(0, s) + snippet + value.slice(s));
    setImgOpen(false);
  }

  async function save() {
    setBusy("guardar");
    setMsg(null);
    const res = await fetch(`/api/admin/articles/${article.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) {
      setMsg({ kind: "ok", text: "Guardado" });
      router.refresh();
    } else {
      setMsg({ kind: "error", text: data.error ?? "No se pudo guardar" });
    }
  }

  async function ai(action: "meta" | "excerpt" | "alt") {
    setBusy(action);
    setMsg(null);
    const res = await fetch(`/api/admin/articles/${article.id}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setMsg({ kind: "error", text: data.error ?? "La IA falló" });
      return;
    }
    setForm((f) => ({ ...f, ...data }));
    setMsg({ kind: "ok", text: "La IA ha rellenado el campo. Revísalo y guarda." });
  }

  async function remove() {
    if (!confirm(`¿Eliminar «${form.title}»? No se puede deshacer.`)) return;
    setBusy("borrar");
    const res = await fetch(`/api/admin/articles/${article.id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/articles");
    else {
      setBusy(null);
      setMsg({ kind: "error", text: "No se pudo eliminar" });
    }
  }

  const titleLen = form.metaTitle.length;
  const descLen = form.metaDescription.length;

  return (
    <div className="art-editor">
      <div className="art-bar">
        <div>
          <h1>{form.title || "Sin título"}</h1>
          <p className="muted">
            {stats.words} palabras · {stats.minutes} min de lectura
          </p>
        </div>
        <div className="art-bar-actions">
          <label className="art-switch">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => set("published", e.target.checked)}
            />
            <span>{form.published ? "Publicado" : "Borrador"}</span>
          </label>
          <a href={`/revista/${form.slug}`} target="_blank" rel="noreferrer" className="art-view">
            Ver ↗
          </a>
          <button type="button" onClick={save} disabled={busy !== null}>
            {busy === "guardar" ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      {msg && <p className={msg.kind === "ok" ? "ok-msg" : "error-msg"}>{msg.text}</p>}

      <div className="art-grid">
        {/* ---------------- Columna principal ---------------- */}
        <div className="art-main">
          <div className="admin-card">
            <label htmlFor="art-title">Título</label>
            <input
              id="art-title"
              value={form.title}
              maxLength={160}
              onChange={(e) => set("title", e.target.value)}
            />

            <label htmlFor="art-slug">
              URL <span className="muted">/revista/{form.slug}</span>
            </label>
            <div className="art-row">
              <input
                id="art-slug"
                value={form.slug}
                onChange={(e) => set("slug", slugify(e.target.value))}
              />
              <button
                type="button"
                className="secondary"
                onClick={() => set("slug", slugify(form.title))}
              >
                Desde el título
              </button>
            </div>
            {form.slug !== article.slug && (
              <p className="art-warn">
                Cambiar la URL rompe los enlaces existentes y Google tendrá que
                reindexar. Hazlo solo si el artículo aún no tiene visitas.
              </p>
            )}

            <label htmlFor="art-excerpt">
              Extracto <span className="muted">— lo que se lee en el listado</span>
            </label>
            <textarea
              id="art-excerpt"
              rows={2}
              maxLength={400}
              value={form.excerpt}
              onChange={(e) => set("excerpt", e.target.value)}
            />
            <button
              type="button"
              className="secondary art-ai"
              onClick={() => ai("excerpt")}
              disabled={busy !== null}
            >
              {busy === "excerpt" ? "Escribiendo…" : "✦ Escribir con IA"}
            </button>
          </div>

          {/* ---------------- Cuerpo ---------------- */}
          <div className="admin-card art-body-card">
            <div className="art-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "escribir"}
                className={tab === "escribir" ? "active" : ""}
                onClick={() => setTab("escribir")}
              >
                Escribir
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "previsualizar"}
                className={tab === "previsualizar" ? "active" : ""}
                onClick={() => setTab("previsualizar")}
              >
                Previsualizar
              </button>
            </div>

            {tab === "escribir" ? (
              <>
                <div className="art-toolbar" role="toolbar" aria-label="Formato">
                  <button type="button" title="Negrita" onClick={() => surround("**", "**", "negrita")}>
                    <strong>B</strong>
                  </button>
                  <button type="button" title="Cursiva" onClick={() => surround("*", "*", "cursiva")}>
                    <em>I</em>
                  </button>
                  <span className="art-sep" aria-hidden />
                  <button type="button" title="Encabezado" onClick={() => prefixLine("## ")}>
                    H2
                  </button>
                  <button type="button" title="Subencabezado" onClick={() => prefixLine("### ")}>
                    H3
                  </button>
                  <span className="art-sep" aria-hidden />
                  <button type="button" title="Lista" onClick={() => prefixLine("- ")}>
                    ☰
                  </button>
                  <button type="button" title="Cita" onClick={() => prefixLine("> ")}>
                    ❝
                  </button>
                  <span className="art-sep" aria-hidden />
                  <button type="button" title="Enlace" onClick={() => setLinkOpen(true)}>
                    🔗 Enlace
                  </button>
                  <button type="button" title="Imagen" onClick={() => setImgOpen(true)}>
                    ▣ Imagen
                  </button>
                </div>

                <textarea
                  ref={bodyRef}
                  className="art-body"
                  rows={22}
                  value={form.body}
                  onChange={(e) => set("body", e.target.value)}
                  spellCheck
                />
                <p className="muted art-hint">
                  Markdown: <code>## título</code>, <code>**negrita**</code>,{" "}
                  <code>*cursiva*</code>, <code>- lista</code>, <code>&gt; cita</code>,{" "}
                  <code>[texto](/ruta)</code>, <code>![alt](imagen)</code>.
                </p>
              </>
            ) : (
              <div className="article-prose art-preview" dangerouslySetInnerHTML={{ __html: preview }} />
            )}
          </div>
        </div>

        {/* ---------------- Barra lateral ---------------- */}
        <div className="art-side">
          <div className="admin-card">
            <h2>Imagen destacada</h2>
            {form.heroImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="art-hero-preview" src={form.heroImageUrl} alt={form.heroImageAlt ?? ""} />
            )}
            <label htmlFor="art-hero">URL de la imagen</label>
            <input
              id="art-hero"
              value={form.heroImageUrl ?? ""}
              placeholder="https://…"
              onChange={(e) => set("heroImageUrl", e.target.value || null)}
            />
            <label htmlFor="art-alt">
              Texto alternativo <span className="muted">— accesibilidad y SEO</span>
            </label>
            <textarea
              id="art-alt"
              rows={2}
              maxLength={220}
              value={form.heroImageAlt ?? ""}
              placeholder="Describe la imagen para quien no puede verla"
              onChange={(e) => set("heroImageAlt", e.target.value || null)}
            />
            <button
              type="button"
              className="secondary art-ai"
              onClick={() => ai("alt")}
              disabled={busy !== null || !form.heroImageUrl}
            >
              {busy === "alt" ? "Escribiendo…" : "✦ Describir con IA"}
            </button>
            {!form.heroImageAlt && form.heroImageUrl && (
              <p className="art-warn">Sin texto alternativo la imagen es invisible para lectores de pantalla.</p>
            )}
            <p className="muted art-hint">
              Puedes usar la foto de cualquier pieza: cópiala de su ficha en Productos.
            </p>
          </div>

          <div className="admin-card">
            <h2>SEO</h2>
            <label htmlFor="art-meta-title">Meta title</label>
            <input
              id="art-meta-title"
              value={form.metaTitle}
              maxLength={70}
              onChange={(e) => set("metaTitle", e.target.value)}
            />
            <p className={titleLen > META_TITLE_MAX ? "art-count art-count-bad" : "art-count"}>
              {titleLen}/{META_TITLE_MAX} caracteres
              {titleLen > META_TITLE_MAX && " — Google lo cortará"}
            </p>

            <label htmlFor="art-meta-desc">Meta description</label>
            <textarea
              id="art-meta-desc"
              rows={3}
              maxLength={200}
              value={form.metaDescription}
              onChange={(e) => set("metaDescription", e.target.value)}
            />
            <p
              className={
                descLen < META_DESC_MIN || descLen > META_DESC_MAX
                  ? "art-count art-count-bad"
                  : "art-count"
              }
            >
              {descLen} caracteres — ideal {META_DESC_MIN}-{META_DESC_MAX}
            </p>

            <button
              type="button"
              className="secondary art-ai"
              onClick={() => ai("meta")}
              disabled={busy !== null}
            >
              {busy === "meta" ? "Escribiendo…" : "✦ Generar metas con IA"}
            </button>

            <p className="muted art-hint">Así se verá en Google:</p>
            <div className="serp-preview">
              <p className="serp-crumbs">Boho Chic › revista › {form.slug || "…"}</p>
              <p className="serp-title">{(form.metaTitle || form.title).slice(0, 65)}</p>
              <p className="serp-desc">
                {(form.metaDescription || form.excerpt || "Sin descripción").slice(0, 160)}
              </p>
            </div>
          </div>

          <div className="admin-card">
            <h2>Categoría</h2>
            <select value={form.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-card">
            <h2>Piezas del artículo</h2>
            {chosen.length > 0 && (
              <ul className="art-chosen">
                {chosen.map((p) => (
                  <li key={p.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageUrl} alt="" />
                    <span>{p.title}</span>
                    <button
                      type="button"
                      aria-label={`Quitar ${p.title}`}
                      onClick={() =>
                        set("productIds", form.productIds.filter((id) => id !== p.id))
                      }
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              value={productQuery}
              placeholder="Buscar una pieza del catálogo…"
              onChange={(e) => setProductQuery(e.target.value)}
            />
            {matches.length > 0 && (
              <ul className="art-matches">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        set("productIds", [...form.productIds, p.id]);
                        setProductQuery("");
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.imageUrl} alt="" />
                      <span>{p.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="admin-card">
            <h2>Zona peligrosa</h2>
            <button type="button" className="secondary danger" onClick={remove} disabled={busy !== null}>
              Eliminar artículo
            </button>
          </div>
        </div>
      </div>

      {linkOpen && (
        <LinkDialog
          internalLinks={internalLinks}
          onClose={() => setLinkOpen(false)}
          onInsert={insertLink}
        />
      )}
      {imgOpen && <ImageDialog onClose={() => setImgOpen(false)} onInsert={insertImage} />}
    </div>
  );
}

/** Diálogo de enlace, con atajos a las páginas internas de la tienda. */
function LinkDialog({
  internalLinks,
  onClose,
  onInsert,
}: {
  internalLinks: Array<{ label: string; href: string }>;
  onClose: () => void;
  onInsert: (label: string, href: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");

  const suggestions = [
    { label: "Toda la tienda", href: "/" },
    ...CATEGORIES.filter((c) => c !== "otros").map((c) => ({
      label: c,
      href: `/?category=${c}`,
    })),
    ...internalLinks,
  ];

  return (
    <div className="art-dialog-backdrop" onClick={onClose}>
      <div className="art-dialog" role="dialog" aria-label="Insertar enlace" onClick={(e) => e.stopPropagation()}>
        <h2>Insertar enlace</h2>
        <label htmlFor="lk-label">Texto visible</label>
        <input id="lk-label" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} />
        <label htmlFor="lk-href">Destino</label>
        <input
          id="lk-href"
          value={href}
          placeholder="/revista/… o https://…"
          onChange={(e) => setHref(e.target.value)}
        />

        <p className="muted art-hint">Enlaces internos (mejoran el SEO):</p>
        <ul className="art-suggestions">
          {suggestions.map((s) => (
            <li key={s.href}>
              <button
                type="button"
                onClick={() => {
                  setHref(s.href);
                  if (!label) setLabel(s.label);
                }}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="art-dialog-actions">
          <button
            type="button"
            onClick={() => onInsert(label || href, href)}
            disabled={!href}
          >
            Insertar
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Diálogo de imagen: el alt es obligatorio, por eso no se puede insertar sin él. */
function ImageDialog({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (url: string, alt: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");

  return (
    <div className="art-dialog-backdrop" onClick={onClose}>
      <div className="art-dialog" role="dialog" aria-label="Insertar imagen" onClick={(e) => e.stopPropagation()}>
        <h2>Insertar imagen</h2>
        <label htmlFor="im-url">URL de la imagen</label>
        <input id="im-url" autoFocus value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
        <label htmlFor="im-alt">Texto alternativo</label>
        <input
          id="im-alt"
          value={alt}
          placeholder="Describe lo que se ve"
          onChange={(e) => setAlt(e.target.value)}
        />
        {url && !alt && <p className="art-warn">Sin alt, la imagen es invisible para quien usa lector de pantalla.</p>}
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="art-hero-preview" src={url} alt={alt} />
        )}
        <div className="art-dialog-actions">
          <button type="button" onClick={() => onInsert(url, alt)} disabled={!url || !alt}>
            Insertar
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
