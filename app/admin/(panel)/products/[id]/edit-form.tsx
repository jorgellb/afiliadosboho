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

  function feedback(ok: boolean, text: string) {
    setIsError(!ok);
    setMessage(text);
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
    });
    const data = await res.json().catch(() => ({}));
    setLoading(null);
    if (res.ok) {
      feedback(true, "Ficha regenerada por el agente ✓ (recargando)");
      router.refresh();
    } else {
      feedback(false, data.error ?? "Error regenerando la ficha");
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
            Tags (separados por comas)
            <input name="tags" defaultValue={product.tags.join(", ")} placeholder="boho, verano" />
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
        <p className="muted">
          Puedes editarla a mano o pedir al agente que la redacte de nuevo.
        </p>
        <label>
          Título SEO (portada y H1 de la ficha)
          <input name="seoTitle" defaultValue={product.seoTitle ?? ""} maxLength={120} />
        </label>
        <label>
          Slug (URL: /producto/…)
          <input name="slug" defaultValue={product.slug ?? ""} pattern="[a-z0-9-]{3,80}" title="minúsculas, números y guiones" />
        </label>
        <label>
          Meta title (≤60 caracteres)
          <input name="metaTitle" defaultValue={product.metaTitle ?? ""} maxLength={70} />
        </label>
        <label>
          Meta description (140–155 caracteres)
          <textarea name="metaDescription" rows={2} maxLength={170} defaultValue={product.metaDescription ?? ""} />
        </label>
        <label>
          Descripción de la ficha
          <textarea name="seoDescription" rows={6} maxLength={2000} defaultValue={product.seoDescription ?? ""} />
        </label>
        <p>
          <button
            type="button"
            className="secondary"
            disabled={loading !== null}
            onClick={regenerateSeo}
          >
            {loading === "seo" ? "Redactando…" : "Regenerar ficha con IA"}
          </button>
        </p>
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
