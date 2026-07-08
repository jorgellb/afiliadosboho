"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  "vestidos",
  "blusas",
  "faldas",
  "pantalones",
  "kimonos",
  "accesorios",
  "bolsos",
  "calzado",
  "joyeria",
  "otros",
] as const;

export interface EditableProduct {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string;
  affiliateUrl: string;
  productUrl: string | null;
  price: string;
  originalPrice: string | null;
  currency: string;
  category: string;
  tags: string[];
  available: boolean;
  isActive: boolean;
  slug: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

/** '' → null para los campos opcionales. */
const orNull = (v: FormDataEntryValue | null) => {
  const s = (v as string | null)?.trim() ?? "";
  return s === "" ? null : s;
};

export function EditForm({ product }: { product: EditableProduct }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  // Campos SEO controlados para vista previa y contadores en vivo.
  const [seoTitle, setSeoTitle] = useState(product.seoTitle ?? "");
  const [slug, setSlug] = useState(product.slug ?? "");
  const [metaTitle, setMetaTitle] = useState(product.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(product.metaDescription ?? "");
  const [seoDescription, setSeoDescription] = useState(product.seoDescription ?? "");
  const [tags, setTags] = useState(product.tags.join(", "));
  const [keyword, setKeyword] = useState("");

  function feedback(ok: boolean, text: string) {
    setIsError(!ok);
    setMessage(text);
  }

  function countClass(len: number, min: number, max: number) {
    if (len === 0) return "seo-count";
    if (len > max) return "seo-count over";
    if (len < min) return "seo-count under";
    return "seo-count ok";
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading("guardar");
    setMessage(null);
    const res = await fetch(`/api/admin/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: (fd.get("title") as string).trim(),
        description: orNull(fd.get("description")),
        imageUrl: (fd.get("imageUrl") as string).trim(),
        affiliateUrl: (fd.get("affiliateUrl") as string).trim(),
        productUrl: orNull(fd.get("productUrl")),
        price: fd.get("price"),
        originalPrice: orNull(fd.get("originalPrice")),
        currency: (fd.get("currency") as string).trim(),
        category: fd.get("category"),
        tags: ((fd.get("tags") as string) || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        available: fd.get("available") === "on",
        isActive: fd.get("isActive") === "on",
        slug: orNull(fd.get("slug")),
        seoTitle: orNull(fd.get("seoTitle")),
        seoDescription: orNull(fd.get("seoDescription")),
        metaTitle: orNull(fd.get("metaTitle")),
        metaDescription: orNull(fd.get("metaDescription")),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(null);
    if (res.ok) {
      feedback(true, "Guardado ✓");
      router.refresh();
    } else {
      feedback(false, data.error ?? "Error al guardar");
    }
  }

  async function regenerateSeo() {
    setLoading("seo");
    setMessage(null);
    const res = await fetch(`/api/admin/products/${product.id}/seo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "full", keyword: keyword || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(null);
    if (res.ok && data.product) {
      const p = data.product;
      setSeoTitle(p.seoTitle ?? "");
      setSlug(p.slug ?? "");
      setMetaTitle(p.metaTitle ?? "");
      setMetaDescription(p.metaDescription ?? "");
      setSeoDescription(p.seoDescription ?? "");
      if (Array.isArray(p.tags)) setTags(p.tags.join(", "));
      feedback(true, "Ficha regenerada por el agente ✓");
      router.refresh();
    } else {
      feedback(false, data.error ?? "Error regenerando la ficha");
    }
  }

  async function generateTags() {
    setLoading("tags");
    setMessage(null);
    const res = await fetch(`/api/admin/products/${product.id}/seo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "tags" }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(null);
    if (res.ok && Array.isArray(data.tags)) {
      setTags(data.tags.join(", "));
      feedback(true, "Tags generados por el agente ✓");
      router.refresh();
    } else {
      feedback(false, data.error ?? "Error generando tags");
    }
  }

  async function refreshPrice() {
    setLoading("precio");
    setMessage(null);
    const res = await fetch(`/api/admin/products/${product.id}/refresh`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    setLoading(null);
    if (res.ok) {
      feedback(true, "Precio y stock actualizados ✓");
      router.refresh();
    } else {
      feedback(false, data.error ?? "Error refrescando el precio");
    }
  }

  async function remove() {
    if (!confirm("¿Borrar este producto definitivamente?")) return;
    setLoading("borrar");
    const res = await fetch(`/api/admin/products/${product.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.push("/admin/products");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setLoading(null);
      feedback(false, data.error ?? "Error al borrar");
    }
  }

  return (
    <form className="edit-grid" onSubmit={onSubmit}>
      <div className="admin-card">
        <h2>Producto</h2>
        <div className="edit-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.imageUrl} alt={product.title} />
        </div>
        <label>
          Título original
          <input name="title" defaultValue={product.title} required minLength={2} maxLength={500} />
        </label>
        <label>
          Descripción
          <textarea name="description" rows={3} maxLength={2000} defaultValue={product.description ?? ""} />
        </label>
        <label>
          URL de la imagen
          <input name="imageUrl" type="url" defaultValue={product.imageUrl} required />
        </label>
        <label>
          URL de afiliado
          <input name="affiliateUrl" type="url" defaultValue={product.affiliateUrl} required />
        </label>
        <label>
          URL del producto (opcional)
          <input name="productUrl" type="url" defaultValue={product.productUrl ?? ""} />
        </label>
        <div className="edit-row">
          <label>
            Precio
            <input name="price" type="number" step="0.01" min="0.01" defaultValue={product.price} required />
          </label>
          <label>
            Precio original
            <input name="originalPrice" type="number" step="0.01" min="0.01" defaultValue={product.originalPrice ?? ""} />
          </label>
          <label>
            Moneda
            <input name="currency" defaultValue={product.currency} minLength={3} maxLength={3} required />
          </label>
        </div>
        <div className="edit-row">
          <label>
            Categoría
            <select name="category" defaultValue={product.category}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tags / keywords (separados por comas)
            <span className="tags-field">
              <input
                name="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="boho, verano"
              />
              <button
                type="button"
                className="secondary"
                disabled={loading !== null}
                onClick={generateTags}
              >
                {loading === "tags" ? "…" : "IA"}
              </button>
            </span>
          </label>
        </div>
        <div className="edit-row edit-checks">
          <label>
            <input type="checkbox" name="isActive" defaultChecked={product.isActive} /> Visible en
            la tienda
          </label>
          <label>
            <input type="checkbox" name="available" defaultChecked={product.available} /> En stock
          </label>
        </div>
      </div>

      <div className="admin-card">
        <h2>Ficha SEO</h2>

        {/* Vista previa de cómo se verá en los resultados de Google */}
        <div className="serp-preview">
          <p className="serp-crumbs">Boho Chic › producto › {slug || "…"}</p>
          <p className="serp-title">
            {(metaTitle || (seoTitle ? `${seoTitle} | Boho Chic` : "") || product.title).slice(0, 65)}
          </p>
          <p className="serp-desc">
            {metaDescription || seoDescription || "Añade una meta description para controlar este texto en Google."}
          </p>
        </div>

        <div className="seo-gen-bar">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Palabra clave objetivo (opcional)"
            aria-label="Palabra clave objetivo"
          />
          <button
            type="button"
            disabled={loading !== null}
            onClick={regenerateSeo}
          >
            {loading === "seo" ? "Redactando…" : "Regenerar con IA"}
          </button>
        </div>

        <label>
          Título SEO (portada y H1 de la ficha)
          <input
            name="seoTitle"
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            maxLength={120}
          />
        </label>
        <label>
          Slug (URL: /producto/…)
          <input
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            pattern="[a-z0-9-]{3,80}"
            title="minúsculas, números y guiones"
          />
        </label>
        <label>
          Meta title{" "}
          <span className={countClass(metaTitle.length, 1, 60)}>
            {metaTitle.length}/60
          </span>
          <input
            name="metaTitle"
            value={metaTitle}
            onChange={(e) => setMetaTitle(e.target.value)}
            maxLength={90}
          />
        </label>
        <label>
          Meta description{" "}
          <span className={countClass(metaDescription.length, 120, 160)}>
            {metaDescription.length}/160
          </span>
          <textarea
            name="metaDescription"
            rows={2}
            maxLength={200}
            value={metaDescription}
            onChange={(e) => setMetaDescription(e.target.value)}
          />
        </label>
        <label>
          Descripción de la ficha
          <textarea
            name="seoDescription"
            rows={6}
            maxLength={2000}
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
          />
        </label>
      </div>

      <div className="admin-card edit-actions">
        {message && <p className={isError ? "error-msg" : "ok-msg"}>{message}</p>}
        <button type="submit" disabled={loading !== null}>
          {loading === "guardar" ? "Guardando…" : "Guardar cambios"}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={loading !== null}
          onClick={refreshPrice}
        >
          {loading === "precio" ? "Consultando…" : "Refrescar precio y stock"}
        </button>
        <button
          type="button"
          className="secondary danger"
          disabled={loading !== null}
          onClick={remove}
        >
          {loading === "borrar" ? "Borrando…" : "Borrar producto"}
        </button>
      </div>
    </form>
  );
}
