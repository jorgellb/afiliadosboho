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

export function ManualAddForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setLoading(true);
    setMessage(null);

    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: fd.get("source"),
        title: fd.get("title"),
        description: (fd.get("description") as string) || null,
        imageUrl: fd.get("imageUrl"),
        price: fd.get("price"),
        currency: ((fd.get("currency") as string) || "USD").toUpperCase(),
        originalPrice: (fd.get("originalPrice") as string) || null,
        affiliateUrl: fd.get("affiliateUrl"),
        productUrl: (fd.get("productUrl") as string) || null,
        category: fd.get("category"),
        tags: ((fd.get("tags") as string) || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    });
    setLoading(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setIsError(false);
      setMessage("Producto guardado ✓");
      form.reset();
      router.refresh();
    } else {
      setIsError(true);
      setMessage(data.error ?? "Error al guardar");
    }
  }

  return (
    <form className="stacked" onSubmit={onSubmit}>
      <label>
        Tienda
        <select name="source" required>
          <option value="amazon">Amazon</option>
          <option value="aliexpress">AliExpress</option>
        </select>
      </label>
      <label>
        Título
        <input name="title" required minLength={2} maxLength={500} />
      </label>
      <label>
        URL de afiliado
        <input name="affiliateUrl" type="url" required />
      </label>
      <label>
        URL del producto (opcional)
        <input name="productUrl" type="url" />
      </label>
      <label>
        URL de la imagen
        <input name="imageUrl" type="url" required />
      </label>
      <label>
        Precio
        <input name="price" type="number" step="0.01" min="0.01" required />
      </label>
      <label>
        Moneda (ISO, ej. USD, EUR)
        <input name="currency" defaultValue="USD" maxLength={3} minLength={3} />
      </label>
      <label>
        Precio original (opcional, para mostrar descuento)
        <input name="originalPrice" type="number" step="0.01" min="0.01" />
      </label>
      <label>
        Categoría
        <select name="category" defaultValue="otros">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tags (separados por comas)
        <input name="tags" placeholder="boho, verano, playa" />
      </label>
      <label>
        Descripción (opcional)
        <textarea name="description" rows={3} maxLength={2000} />
      </label>
      {message && <p className={isError ? "error-msg" : "ok-msg"}>{message}</p>}
      <button type="submit" disabled={loading}>
        {loading ? "Guardando..." : "Añadir producto"}
      </button>
    </form>
  );
}
