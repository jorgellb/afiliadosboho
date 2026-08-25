import Link from "next/link";
import type { StoreFilters } from "@/lib/products";
import type { Product } from "@/lib/db/schema";
import { DiscountBadge, SocialRow } from "./social-proof";
import { SIZES, responsive } from "@/lib/images";
import { Mushroom } from "./boho-art";

/**
 * Listado de tienda: buscador, filtros, rejilla y paginación.
 *
 * Lo comparten la home (`/`) y las páginas de colección (`/vestidos-boho`…).
 * La diferencia está en `basePath` y en `categoryInPath`: en una colección la
 * categoría viaja en la RUTA, así que no debe aparecer también como parámetro
 * — si lo hiciera tendríamos dos URLs distintas para el mismo listado.
 */
export interface StoreListingProps {
  /** Ruta sobre la que se construyen los enlaces: "/" o "/vestidos-boho". */
  basePath: string;
  filters: StoreFilters;
  items: Product[];
  total: number;
  page: number;
  totalPages: number;
  /** Encabezado de la sección (h2). */
  heading: string;
  /** True en colecciones: la categoría la fija la ruta. */
  categoryInPath?: boolean;
}

export function buildHref(
  basePath: string,
  filters: StoreFilters,
  page: number,
  categoryInPath = false
): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (!categoryInPath && filters.category)
    params.set("category", filters.category);
  if (filters.min !== undefined) params.set("min", String(filters.min));
  if (filters.max !== undefined) params.set("max", String(filters.max));
  if (filters.sort && filters.sort !== "recientes")
    params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function formatPrice(price: string, currency: string): string {
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency,
  }).format(Number(price));
}

export function StoreListing({
  basePath,
  filters,
  items,
  total,
  page,
  totalPages,
  heading,
  categoryInPath = false,
}: StoreListingProps) {
  const href = (f: StoreFilters, p: number) =>
    buildHref(basePath, f, p, categoryInPath);

  // En una colección la categoría no es un filtro que se pueda quitar: es la
  // identidad de la página. Solo se ofrece como chip retirable en la home.
  const hasRemovableFilters =
    Boolean(filters.q) ||
    (!categoryInPath && Boolean(filters.category)) ||
    filters.min !== undefined ||
    filters.max !== undefined;

  return (
    <section id="tienda">
      <div className="shop-head">
        <h2>{heading}</h2>
        <span className="shop-count">
          {total} pieza{total === 1 ? "" : "s"}
        </span>
      </div>

      <div className="toolbar">
        <form className="toolbar-form" method="get" action={basePath}>
          {!categoryInPath && filters.category && (
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
              href={href({ ...filters, sort: value }, 1)}
              className={
                (filters.sort ?? "recientes") === value ? "active" : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {hasRemovableFilters && (
        <div className="active-filters">
          {filters.q && (
            <Link href={href({ ...filters, q: undefined }, 1)}>
              “{filters.q}” ✕
            </Link>
          )}
          {!categoryInPath && filters.category && (
            <Link href={href({ ...filters, category: undefined }, 1)}>
              {filters.category} ✕
            </Link>
          )}
          {filters.min !== undefined && (
            <Link href={href({ ...filters, min: undefined }, 1)}>
              desde {filters.min} ✕
            </Link>
          )}
          {filters.max !== undefined && (
            <Link href={href({ ...filters, max: undefined }, 1)}>
              hasta {filters.max} ✕
            </Link>
          )}
          <Link className="clear-all" href={basePath}>
            Limpiar todo
          </Link>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty-state">
          <Mushroom className="boho-art empty-motif" />
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
                  <img
                    {...responsive(product.imageUrl, SIZES.grid)}
                    alt={displayTitle}
                    loading="lazy"
                    decoding="async"
                    width={640}
                    height={640}
                  />
                  <DiscountBadge discountPct={product.discountPct} />
                </Link>
                <h3>
                  <Link href={fichaHref}>{displayTitle}</Link>
                </h3>
                <SocialRow
                  rating={product.rating}
                  ordersCount={product.ordersCount}
                  discountPct={product.discountPct}
                />
                <p className="price">
                  {formatPrice(product.price, product.currency)}
                  {product.originalPrice && (
                    <span className="original">
                      {formatPrice(product.originalPrice, product.currency)}
                    </span>
                  )}
                </p>
                {/* Anchor descriptivo en vez de un "Ver la pieza" genérico
                    repetido 24 veces por página. */}
                <Link className="buy-link" href={fichaHref}>
                  Ver {displayTitle.slice(0, 45).toLowerCase()}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="pagination" aria-label="Paginación">
          {page > 1 && <Link href={href(filters, page - 1)}>← Anterior</Link>}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .map((p, idx, arr) => (
              <span key={p} style={{ display: "contents" }}>
                {idx > 0 && arr[idx - 1] !== p - 1 && <span>…</span>}
                {p === page ? (
                  <span className="current">{p}</span>
                ) : (
                  <Link href={href(filters, p)}>{p}</Link>
                )}
              </span>
            ))}
          {page < totalPages && (
            <Link href={href(filters, page + 1)}>Siguiente →</Link>
          )}
        </nav>
      )}
    </section>
  );
}
