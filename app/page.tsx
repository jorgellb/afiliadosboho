import Link from "next/link";
import { CATEGORIES } from "@/lib/db/schema";
import { getStoreProducts, parseStoreFilters, StoreFilters } from "@/lib/products";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  amazon: "Amazon",
  aliexpress: "AliExpress",
};

function pageHref(filters: StoreFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.source) params.set("source", filters.source);
  if (filters.category) params.set("category", filters.category);
  if (filters.min !== undefined) params.set("min", String(filters.min));
  if (filters.max !== undefined) params.set("max", String(filters.max));
  if (filters.sort && filters.sort !== "recientes") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

function formatPrice(price: string, currency: string): string {
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency,
  }).format(Number(price));
}

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const filters = parseStoreFilters(await searchParams);
  const { items, total, page, totalPages } = await getStoreProducts(filters);

  return (
    <>
      <h1>Moda boho chic</h1>

      <form className="filters" method="get" action="/">
        <label>
          Buscar
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="vestido boho, kimono..."
          />
        </label>
        <label>
          Tienda
          <select name="source" defaultValue={filters.source ?? ""}>
            <option value="">Todas</option>
            <option value="amazon">Amazon</option>
            <option value="aliexpress">AliExpress</option>
          </select>
        </label>
        <label>
          Categoría
          <select name="category" defaultValue={filters.category ?? ""}>
            <option value="">Todas</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Precio mín.
          <input type="number" name="min" min="0" step="0.01" defaultValue={filters.min ?? ""} />
        </label>
        <label>
          Precio máx.
          <input type="number" name="max" min="0" step="0.01" defaultValue={filters.max ?? ""} />
        </label>
        <label>
          Ordenar
          <select name="sort" defaultValue={filters.sort ?? "recientes"}>
            <option value="recientes">Más recientes</option>
            <option value="precio_asc">Precio: menor a mayor</option>
            <option value="precio_desc">Precio: mayor a menor</option>
          </select>
        </label>
        <button type="submit">Filtrar</button>
      </form>

      <p className="muted">
        {total} producto{total === 1 ? "" : "s"} encontrado{total === 1 ? "" : "s"}
      </p>

      {items.length === 0 ? (
        <p>No hay productos que coincidan con tu búsqueda.</p>
      ) : (
        <ul className="product-grid">
          {items.map((product) => (
            <li key={product.id} className="product-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.imageUrl} alt={product.title} loading="lazy" />
              <span className="badge">{SOURCE_LABELS[product.source]}</span>
              <h3>{product.title}</h3>
              <p className="price">
                {formatPrice(product.price, product.currency)}
                {product.originalPrice && (
                  <span className="original">
                    {formatPrice(product.originalPrice, product.currency)}
                  </span>
                )}
              </p>
              <a
                className="buy-link"
                href={`/go/${product.id}`}
                target="_blank"
                rel="nofollow sponsored noopener"
              >
                Comprar en {SOURCE_LABELS[product.source]}
              </a>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="pagination" aria-label="Paginación">
          {page > 1 && <Link href={pageHref(filters, page - 1)}>← Anterior</Link>}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .map((p, idx, arr) => (
              <span key={p} style={{ display: "contents" }}>
                {idx > 0 && arr[idx - 1] !== p - 1 && <span>…</span>}
                {p === page ? (
                  <span className="current">{p}</span>
                ) : (
                  <Link href={pageHref(filters, p)}>{p}</Link>
                )}
              </span>
            ))}
          {page < totalPages && <Link href={pageHref(filters, page + 1)}>Siguiente →</Link>}
        </nav>
      )}
    </>
  );
}
