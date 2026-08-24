"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
  title: string;
  seoTitle: string | null;
  slug: string | null;
  imageUrl: string;
  price: string;
  currency: string;
  category: string;
  tags: string[];
  available: boolean;
  isActive: boolean;
  clicks: number;
  hasSeo: boolean;
  lastCheckedAt: string;
}

type EstadoFilter = "todos" | "visibles" | "ocultos" | "sin-stock" | "sin-ficha";

/** Filas por página en el listado del panel. */
const ROWS_PER_PAGE = 100;

export function ProductsTable({ products }: { products: AdminProduct[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [estado, setEstado] = useState<EstadoFilter>("todos");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !`${p.title} ${p.seoTitle ?? ""} ${p.tags.join(" ")}`.toLowerCase().includes(q))
        return false;
      if (category && p.category !== category) return false;
      if (estado === "visibles" && !(p.isActive && p.available)) return false;
      if (estado === "ocultos" && p.isActive) return false;
      if (estado === "sin-stock" && p.available) return false;
      if (estado === "sin-ficha" && p.hasSeo) return false;
      return true;
    });
  }, [products, search, category, estado]);

  // Paginación en cliente. El listado pintaba TODAS las filas: con 202
  // productos se notaba poco, pero a 5000 son 5000 filas de DOM y la página
  // se vuelve inmanejable. Los filtros siguen operando sobre el catálogo
  // entero; lo que se acota es lo que se dibuja.
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const current = Math.min(page, totalPages);
  const visible = filtered.slice(
    (current - 1) * ROWS_PER_PAGE,
    current * ROWS_PER_PAGE
  );

  // Al cambiar de filtro se vuelve a la primera página: quedarse en la 7 de
  // un listado que ahora tiene 2 daría una tabla vacía sin explicación.
  const filterKey = `${search}|${category}|${estado}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (lastFilterKey !== filterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  async function action(
    id: string,
    path: string,
    init: RequestInit,
    okMsg: string
  ) {
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

  return (
    <div className="admin-card">
      <div className="admin-filterbar">
        <input
          type="search"
          placeholder="Buscar por título o tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoFilter)}
        >
          <option value="todos">Todos los estados</option>
          <option value="visibles">Visibles</option>
          <option value="ocultos">Ocultos</option>
          <option value="sin-stock">Sin stock</option>
          <option value="sin-ficha">Sin ficha SEO</option>
        </select>
        <span className="muted">
          {filtered.length} de {products.length}
          {totalPages > 1 && ` · página ${current} de ${totalPages}`}
        </span>
      </div>

      {message && <p className={isError ? "error-msg" : "ok-msg"}>{message}</p>}

      {filtered.length === 0 ? (
        <p className="muted">Ningún producto coincide con el filtro.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th></th>
                <th>Título</th>
                <th>Precio</th>
                <th>Categoría</th>
                <th>Estado</th>
                <th>Ficha</th>
                <th>Clics</th>
                <th>Chequeado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const busy = busyId === p.id;
                return (
                  <tr key={p.id}>
                    <td>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.imageUrl} alt="" />
                    </td>
                    <td>
                      <Link href={`/admin/products/${p.id}`}>
                        {p.seoTitle ?? p.title}
                      </Link>
                    </td>
                    <td>
                      {p.price} {p.currency}
                    </td>
                    <td>{p.category}</td>
                    <td>
                      {!p.isActive ? (
                        <span className="pill pill-muted">Oculto</span>
                      ) : p.available ? (
                        <span className="pill pill-ok">Visible</span>
                      ) : (
                        <span className="pill pill-warn">Sin stock</span>
                      )}
                    </td>
                    <td>{p.hasSeo ? "✓" : "—"}</td>
                    <td>{p.clicks}</td>
                    <td>{new Date(p.lastCheckedAt).toLocaleDateString("es")}</td>
                    <td className="table-actions">
                      <Link href={`/admin/products/${p.id}`}>Editar</Link>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          action(
                            p.id,
                            `/api/admin/products/${p.id}/refresh`,
                            { method: "POST" },
                            "Precio actualizado ✓"
                          )
                        }
                      >
                        Refrescar
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          if (!confirm(`¿Borrar "${p.seoTitle ?? p.title}"?`)) return;
                          action(
                            p.id,
                            `/api/admin/products/${p.id}`,
                            { method: "DELETE" },
                            "Borrado ✓"
                          );
                        }}
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <nav className="admin-pagination" aria-label="Paginación del listado">
              <button
                type="button"
                onClick={() => setPage(current - 1)}
                disabled={current === 1}
              >
                ← Anterior
              </button>
              <span className="muted">
                {current} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(current + 1)}
                disabled={current === totalPages}
              >
                Siguiente →
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
