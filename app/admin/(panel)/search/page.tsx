"use client";

import { useState } from "react";

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
  alreadySaved: boolean;
}

export default function AdminSearchPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<Record<string, string>>({});

  async function search(targetPage: number) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query, page: String(targetPage) });
      const res = await fetch(`/api/admin/search?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Error en la búsqueda");
        setResults([]);
      } else {
        setResults(data.results);
        setPage(targetPage);
        setSavedIds(new Set());
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  async function save(result: SearchResult) {
    setError(null);
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "aliexpress",
        sourceProductId: result.sourceProductId,
        title: result.title,
        description: result.description,
        imageUrl: result.imageUrl,
        price: result.price,
        currency: result.currency,
        originalPrice: result.originalPrice,
        affiliateUrl: result.affiliateUrl,
        productUrl: result.productUrl,
        available: result.available,
        category: categories[result.sourceProductId] ?? "otros",
      }),
    });
    if (res.ok) {
      setSavedIds((prev) => new Set(prev).add(result.sourceProductId));
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Error al guardar el producto");
    }
  }

  return (
    <>
      <h1>Buscar en AliExpress</h1>
      <div className="admin-card">
        <form
          className="admin-filterbar"
          onSubmit={(e) => {
            e.preventDefault();
            search(1);
          }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="vestido boho, kimono playa…"
            required
            minLength={2}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Buscando…" : "Buscar"}
          </button>
        </form>

        {error && <p className="error-msg">{error}</p>}

        {results.length > 0 && (
          <>
            <ul className="search-results">
              {results.map((r) => {
                const saved = r.alreadySaved || savedIds.has(r.sourceProductId);
                return (
                  <li key={r.sourceProductId} className="product-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.imageUrl} alt={r.title} loading="lazy" />
                    <h3>{r.title}</h3>
                    <p className="price">
                      {r.price !== null ? `${r.price} ${r.currency}` : "Sin precio"}
                      {r.originalPrice && (
                        <span className="original">
                          {r.originalPrice} {r.currency}
                        </span>
                      )}
                    </p>
                    <label>
                      Categoría
                      <select
                        value={categories[r.sourceProductId] ?? "otros"}
                        onChange={(e) =>
                          setCategories((prev) => ({
                            ...prev,
                            [r.sourceProductId]: e.target.value,
                          }))
                        }
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button onClick={() => save(r)} disabled={saved || r.price === null}>
                      {saved ? "Guardado ✓" : "Guardar"}
                    </button>
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
