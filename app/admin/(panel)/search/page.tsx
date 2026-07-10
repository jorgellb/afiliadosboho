"use client";

import { useMemo, useState } from "react";

const CATEGORIES = [
  "vestidos", "blusas", "faldas", "pantalones", "kimonos",
  "accesorios", "bolsos", "calzado", "joyeria", "otros",
] as const;

/** Consulta que propone cada categoría cuando aún no has escrito nada. */
const CATEGORY_HINTS: Record<string, string> = {
  vestidos: "vestido boho",
  blusas: "blusa boho bordada",
  faldas: "falda boho larga",
  pantalones: "pantalon boho ancho",
  kimonos: "kimono boho",
  accesorios: "sombrero boho",
  bolsos: "bolso boho crochet",
  calzado: "sandalias boho",
  joyeria: "collar boho",
  otros: "",
};

interface SearchResult {
  source: "aliexpress";
  sourceProductId: string;
  title: string;
  description: string | null;
  imageUrl: string;
  price: string | null;
  currency: string;
  originalPrice: string | null;
  affiliateUrl: string;
  productUrl: string | null;
  available: boolean;
  discountPct: number | null;
  ordersCount: number | null;
  alreadySaved: boolean;
}

export default function AdminSearchPage() {
  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("relevancia");
  const [target, setTarget] = useState<string>("otros");

  const [page, setPage] = useState(1);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  /** Categoría por producto; si no la tocas, manda la de «Guardar en». */
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const selectable = useMemo(
    () =>
      results.filter(
        (r) => r.price !== null && !r.alreadySaved && !savedIds.has(r.sourceProductId)
      ),
    [results, savedIds]
  );
  const allSelected =
    selectable.length > 0 && selectable.every((r) => selected.has(r.sourceProductId));

  async function search(targetPage: number) {
    setLoading(true);
    setError(null);
    setOkMsg(null);
    try {
      const params = new URLSearchParams({ q: query, page: String(targetPage), sort });
      if (minPrice) params.set("min", minPrice);
      if (maxPrice) params.set("max", maxPrice);
      const res = await fetch(`/api/admin/search?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Error en la búsqueda");
        setResults([]);
      } else {
        setResults(data.results);
        setPage(targetPage);
        setSelected(new Set());
        setSavedIds(new Set());
        setOverrides({});
      }
      setSearched(true);
    } catch {
      // Sin esto un fallo de red dejaría el botón en «Buscando…» para siempre.
      setError("No se pudo conectar. Revisa tu conexión.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.sourceProductId)));
  }

  async function saveSelected() {
    const items = results
      .filter((r) => selected.has(r.sourceProductId) && r.price !== null)
      .map((r) => ({
        sourceProductId: r.sourceProductId,
        title: r.title,
        description: r.description,
        imageUrl: r.imageUrl,
        price: r.price,
        currency: r.currency,
        originalPrice: r.originalPrice,
        affiliateUrl: r.affiliateUrl,
        productUrl: r.productUrl,
        available: r.available,
        category: overrides[r.sourceProductId] ?? target,
      }));
    if (items.length === 0) return;

    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudieron guardar");
        return;
      }
      const failed: string[] = data.failed ?? [];
      setSavedIds((prev) => {
        const next = new Set(prev);
        for (const item of items) {
          if (!failed.includes(item.sourceProductId)) next.add(item.sourceProductId);
        }
        return next;
      });
      setSelected(new Set());
      setOkMsg(
        `${data.saved} producto${data.saved === 1 ? "" : "s"} añadido${data.saved === 1 ? "" : "s"} a la tienda` +
          (failed.length ? ` · ${failed.length} fallaron` : "")
      );
    } catch {
      setError("No se pudo conectar. Revisa tu conexión.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h1>Buscar en AliExpress</h1>

      <div className="admin-card">
        <form
          className="find-form"
          onSubmit={(e) => {
            e.preventDefault();
            search(1);
          }}
        >
          <div className="find-row">
            <label className="find-grow">
              Qué buscar
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="vestido boho, kimono playa…"
                required
                minLength={2}
              />
            </label>
            <label>
              Guardar en
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  // Con el buscador vacío, la categoría propone qué buscar.
                  if (!query && CATEGORY_HINTS[e.target.value]) {
                    setQuery(CATEGORY_HINTS[e.target.value]);
                  }
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="find-row">
            {/* Los dos precios van juntos: apilados comen media pantalla. */}
            <div className="find-prices">
              <label>
                Precio mín. (€)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={minPrice}
                  placeholder="0"
                  onChange={(e) => setMinPrice(e.target.value)}
                />
              </label>
              <label>
                Precio máx. (€)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={maxPrice}
                  placeholder="sin límite"
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </label>
            </div>
            <label>
              Ordenar por
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="relevancia">Relevancia</option>
                <option value="precio_asc">Precio: de menor a mayor</option>
                <option value="precio_desc">Precio: de mayor a menor</option>
                <option value="ventas">Más vendidos</option>
              </select>
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Buscando…" : "Buscar"}
            </button>
          </div>
        </form>

        {error && <p className="error-msg">{error}</p>}
        {okMsg && <p className="ok-msg">{okMsg}</p>}

        {searched && results.length === 0 && !loading && !error && (
          <p className="muted">
            Ningún producto encaja con el filtro. AliExpress filtra por su propio
            precio, así que aquí se vuelve a depurar sobre el precio en euros:
            prueba a ampliar el rango o a pasar de página.
          </p>
        )}

        {results.length > 0 && (
          <>
            <div className="find-bar">
              <label className="find-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectable.length === 0}
                />
                <span>
                  {allSelected ? "Quitar la selección" : "Seleccionar todos"} (
                  {selectable.length} disponibles)
                </span>
              </label>
              <button type="button" onClick={saveSelected} disabled={selected.size === 0 || saving}>
                {saving ? "Guardando…" : `Añadir ${selected.size} a la tienda`}
              </button>
            </div>

            <ul className="search-results">
              {results.map((r) => {
                const saved = r.alreadySaved || savedIds.has(r.sourceProductId);
                const noPrice = r.price === null;
                const checked = selected.has(r.sourceProductId);
                return (
                  <li
                    key={r.sourceProductId}
                    className={`product-card find-card${checked ? " selected" : ""}${saved ? " saved" : ""}`}
                  >
                    <label className="find-pick">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={saved || noPrice}
                        onChange={() => toggle(r.sourceProductId)}
                        aria-label={`Seleccionar ${r.title}`}
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.imageUrl} alt={r.title} loading="lazy" />
                      {r.discountPct !== null && r.discountPct >= 5 && (
                        <span className="discount-badge">−{r.discountPct}%</span>
                      )}
                      {saved && <span className="find-saved">Ya en la tienda</span>}
                    </label>

                    <h3>{r.title}</h3>
                    <p className="price">
                      {noPrice ? "Sin precio" : `${r.price} ${r.currency}`}
                      {r.originalPrice && (
                        <span className="original">
                          {r.originalPrice} {r.currency}
                        </span>
                      )}
                    </p>
                    {r.ordersCount ? (
                      <p className="muted find-orders">{r.ordersCount} vendidos</p>
                    ) : null}

                    <label className="find-cat">
                      Categoría
                      <select
                        value={overrides[r.sourceProductId] ?? target}
                        disabled={saved}
                        onChange={(e) =>
                          setOverrides((prev) => ({ ...prev, [r.sourceProductId]: e.target.value }))
                        }
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                );
              })}
            </ul>

            <nav className="pagination">
              {page > 1 && (
                <button className="secondary" disabled={loading} onClick={() => search(page - 1)}>
                  ← Anterior
                </button>
              )}
              <span className="current">{page}</span>
              <button className="secondary" disabled={loading} onClick={() => search(page + 1)}>
                Siguiente →
              </button>
            </nav>
          </>
        )}
      </div>
    </>
  );
}
