import Link from "next/link";
import { CATEGORIES } from "@/lib/db/schema";
import { getStoreProducts, parseStoreFilters, StoreFilters } from "@/lib/products";

export const dynamic = "force-dynamic";

function pageHref(filters: StoreFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
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

  const isPortada =
    !filters.q &&
    !filters.category &&
    filters.min === undefined &&
    filters.max === undefined &&
    page === 1;
  const collage = items.slice(0, 2);

  return (
    <>
      {isPortada && (
        <section className="hero">
          <div>
            <p className="hero-kicker">La edición de esta temporada</p>
            <h1>
              El arte de <em>vestir libre</em>
            </h1>
            <p className="hero-lead">
              Crochet, flecos, bordados y vestidos que huelen a sal. Una
              selección viva de moda bohemia, elegida a mano — y con ayuda de
              nuestra estilista de inteligencia artificial — entre miles de
              prendas.
            </p>
            <div className="hero-actions">
              <a className="btn-primary" href="#tienda">
                Explorar la tienda
              </a>
              <Link className="btn-ghost" href="/asistente">
                Pedir consejo a la estilista ✦
              </Link>
            </div>
            <p className="hero-meta">
              {total} piezas · {CATEGORIES.length - 1} colecciones · curaduría
              con inteligencia artificial
            </p>
          </div>
          {collage.length > 0 && (
            <figure className="hero-collage">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="col-a" src={collage[0].imageUrl} alt={collage[0].title} />
              {collage[1] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="col-b" src={collage[1].imageUrl} alt={collage[1].title} />
              )}
              <figcaption>boho</figcaption>
              <span className="hero-stamp" aria-hidden>
                nueva<br />edición
              </span>
            </figure>
          )}
        </section>
      )}

      {isPortada && (
        <div className="marquee" aria-hidden>
          <div className="marquee-track">
            {[0, 1].map((n) => (
              <span key={n}>
                Nuevas piezas cada semana ✦ Crochet · Flecos · Bordados ✦
                Curado con inteligencia artificial ✦ Vestidos que huelen a sal ✦
              </span>
            ))}
          </div>
        </div>
      )}

      <nav className="collections" aria-label="Colecciones">
        {CATEGORIES.filter((c) => c !== "otros").map((c) => (
          <Link
            key={c}
            href={`/?category=${c}`}
            className={filters.category === c ? "active" : undefined}
          >
            {c}
          </Link>
        ))}
      </nav>

      <section id="tienda">
        <div className="shop-head">
          <h2>
            {filters.category
              ? `Colección · ${filters.category}`
              : filters.q
                ? `Resultados · “${filters.q}”`
                : "La tienda"}
          </h2>
          <span className="shop-count">
            {total} pieza{total === 1 ? "" : "s"}
          </span>
        </div>

        <div className="toolbar">
          <form className="toolbar-form" method="get" action="/">
            {filters.category && (
              <input type="hidden" name="category" value={filters.category} />
            )}
            {filters.sort && filters.sort !== "recientes" && (
              <input type="hidden" name="sort" value={filters.sort} />
            )}
            <span className="toolbar-glyph" aria-hidden>
              ⌕
            </span>
            <input
              className="toolbar-search"
              type="search"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Busca una pieza: vestido, kimono, crochet…"
              aria-label="Buscar en la tienda"
            />
            <span className="toolbar-price">
              <input
                type="number"
                name="min"
                min="0"
                step="0.01"
                placeholder="€ mín"
                aria-label="Precio mínimo"
                defaultValue={filters.min ?? ""}
              />
              <span aria-hidden>—</span>
              <input
                type="number"
                name="max"
                min="0"
                step="0.01"
                placeholder="€ máx"
                aria-label="Precio máximo"
                defaultValue={filters.max ?? ""}
              />
            </span>
            <button type="submit">Aplicar</button>
          </form>
          <nav className="toolbar-sort" aria-label="Ordenar">
            {(
              [
                ["recientes", "Recientes"],
                ["precio_asc", "Precio ↑"],
                ["precio_desc", "Precio ↓"],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                href={pageHref({ ...filters, sort: value }, 1)}
                className={
                  (filters.sort ?? "recientes") === value ? "active" : undefined
                }
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {(filters.q ||
          filters.category ||
          filters.min !== undefined ||
          filters.max !== undefined) && (
          <div className="active-filters">
            {filters.q && (
              <Link href={pageHref({ ...filters, q: undefined }, 1)}>
                “{filters.q}” ✕
              </Link>
            )}
            {filters.category && (
              <Link href={pageHref({ ...filters, category: undefined }, 1)}>
                {filters.category} ✕
              </Link>
            )}
            {filters.min !== undefined && (
              <Link href={pageHref({ ...filters, min: undefined }, 1)}>
                desde {filters.min} ✕
              </Link>
            )}
            {filters.max !== undefined && (
              <Link href={pageHref({ ...filters, max: undefined }, 1)}>
                hasta {filters.max} ✕
              </Link>
            )}
            <Link className="clear-all" href="/">
              Limpiar todo
            </Link>
          </div>
        )}

        {items.length === 0 ? (
          <div className="empty-state">
            <p>
              No hay piezas que coincidan con tu búsqueda…
              <br />
              prueba con otra palabra o pide ayuda a la estilista.
            </p>
            <Link className="btn-ghost" href="/asistente">
              Preguntar a la estilista ✨
            </Link>
          </div>
        ) : (
          <ul className="product-grid">
            {items.map((product) => {
              const fichaHref = `/producto/${product.slug ?? product.id}`;
              const displayTitle = product.seoTitle ?? product.title;
              return (
                <li key={product.id} className="product-card">
                  <Link
                    className="card-media"
                    href={fichaHref}
                    aria-label={displayTitle}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={product.imageUrl} alt={displayTitle} loading="lazy" />
                  </Link>
                  <h3>
                    <Link href={fichaHref}>{displayTitle}</Link>
                  </h3>
                  <p className="price">
                    {formatPrice(product.price, product.currency)}
                    {product.originalPrice && (
                      <span className="original">
                        {formatPrice(product.originalPrice, product.currency)}
                      </span>
                    )}
                  </p>
                  <Link className="buy-link" href={fichaHref}>
                    Ver la pieza
                  </Link>
                </li>
              );
            })}
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
      </section>
    </>
  );
}
