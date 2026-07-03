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

export interface AdminProduct {
  id: string;
  source: string;
  title: string;
  imageUrl: string;
  price: string;
  currency: string;
  category: string;
  tags: string[];
  available: boolean;
  isActive: boolean;
  clicks: number;
  lastCheckedAt: string;
}

export function ProductsTable({ products }: { products: AdminProduct[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  // Ediciones locales pendientes de guardar, por producto.
  const [edits, setEdits] = useState<
    Record<string, { category: string; tags: string; isActive: boolean }>
  >({});

  function editState(p: AdminProduct) {
    return (
      edits[p.id] ?? {
        category: p.category,
        tags: p.tags.join(", "),
        isActive: p.isActive,
      }
    );
  }

  function setEdit(p: AdminProduct, patch: Partial<ReturnType<typeof editState>>) {
    setEdits((prev) => ({ ...prev, [p.id]: { ...editState(p), ...patch } }));
  }

  async function request(id: string, path: string, init: RequestInit, okMsg: string) {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch(path, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error ?? "Error");
      } else {
        setIsError(false);
        setMessage(okMsg);
        router.refresh();
      }
    } catch {
      setIsError(true);
      setMessage("Error de red");
    } finally {
      setBusyId(null);
    }
  }

  function saveRow(p: AdminProduct) {
    const state = editState(p);
    request(
      p.id,
      `/api/admin/products/${p.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: state.category,
          tags: state.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          isActive: state.isActive,
        }),
      },
      "Guardado ✓"
    );
  }

  function refreshRow(p: AdminProduct) {
    request(
      p.id,
      `/api/admin/products/${p.id}/refresh`,
      { method: "POST" },
      "Precio actualizado ✓"
    );
  }

  function deleteRow(p: AdminProduct) {
    if (!confirm(`¿Borrar "${p.title}"?`)) return;
    request(p.id, `/api/admin/products/${p.id}`, { method: "DELETE" }, "Borrado ✓");
  }

  if (products.length === 0) {
    return <p className="muted">No hay productos guardados todavía.</p>;
  }

  return (
    <>
      {message && <p className={isError ? "error-msg" : "ok-msg"}>{message}</p>}
      <div style={{ overflowX: "auto" }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th></th>
              <th>Título</th>
              <th>Tienda</th>
              <th>Precio</th>
              <th>Categoría</th>
              <th>Tags</th>
              <th>Visible</th>
              <th>Stock</th>
              <th>Clics</th>
              <th>Chequeado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const state = editState(p);
              const busy = busyId === p.id;
              return (
                <tr key={p.id}>
                  <td>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageUrl} alt="" />
                  </td>
                  <td>{p.title}</td>
                  <td>{p.source}</td>
                  <td>
                    {p.price} {p.currency}
                  </td>
                  <td>
                    <select
                      value={state.category}
                      onChange={(e) => setEdit(p, { category: e.target.value })}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={state.tags}
                      onChange={(e) => setEdit(p, { tags: e.target.value })}
                      placeholder="boho, verano"
                      style={{ width: "8rem" }}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={state.isActive}
                      onChange={(e) => setEdit(p, { isActive: e.target.checked })}
                    />
                  </td>
                  <td>{p.available ? "Sí" : "No"}</td>
                  <td>{p.clicks}</td>
                  <td>{new Date(p.lastCheckedAt).toLocaleDateString("es")}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button disabled={busy} onClick={() => saveRow(p)}>
                      Guardar
                    </button>{" "}
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => refreshRow(p)}
                    >
                      Refrescar
                    </button>{" "}
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => deleteRow(p)}
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
