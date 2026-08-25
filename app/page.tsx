import type { Metadata } from "next";
import Link from "next/link";
import { COLLECTIONS } from "@/lib/collections";
import { getStoreProducts, parseStoreFilters } from "@/lib/products";
import { CategoryIcon } from "./components/category-icon";
import { SIZES, responsive } from "@/lib/images";
import { StoreListing } from "./components/store-listing";
import { Divider, SunBurst } from "./components/boho-art";

export const dynamic = "force-dynamic";

/** Un filtro activo convierte el listado en una vista que no debe indexarse. */
function hasFilters(sp: { [key: string]: string | string[] | undefined }) {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  return Boolean(
    one(sp.q) ||
      one(sp.category) ||
      one(sp.min) ||
      one(sp.max) ||
      (one(sp.sort) && one(sp.sort) !== "recientes")
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const page = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1;
  const filtered = hasFilters(sp);

  // Búsquedas y filtros comparten plantilla con la portada pero no aportan
  // nada al índice: se marcan noindex,follow para que Google siga los enlaces
  // a fichas y colecciones sin quedarse las combinaciones.
  return {
    alternates: { canonical: page > 1 ? `/?page=${page}` : "/" },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
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

  const heading = filters.category
    ? `Colección · ${filters.category}`
    : filters.q
      ? `Resultados · “${filters.q}”`
      : "La tienda";

  return (
    <>
      {isPortada && (
        <section className="hero">
          {/* Sol setentero detras del titular: la pieza que da caracter sin
              competir con el texto, por eso al 13% de opacidad. */}
          <SunBurst className="boho-art hero-sun" />
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
              {total} piezas · {COLLECTIONS.length} colecciones · curaduría
              con inteligencia artificial
            </p>
          </div>
          {collage.length > 0 && (
            <figure className="hero-collage">
              {/* La primera imagen es candidata a LCP: sin lazy y con prioridad
                  de descarga, para no retrasar el mayor elemento visible. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="col-a"
                {...responsive(collage[0].imageUrl, SIZES.hero)}
                alt={collage[0].title}
                fetchPriority="high"
                decoding="async"
                width={800}
                height={800}
              />
              {collage[1] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="col-b"
                  {...responsive(collage[1].imageUrl, SIZES.hero)}
                  alt={collage[1].title}
                  loading="lazy"
                  decoding="async"
                  width={640}
                  height={640}
                />
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

      {isPortada && <Divider motif="daisy" />}

      <nav className="collections" aria-label="Colecciones">
        {COLLECTIONS.map((c) => (
          <Link
            key={c.slug}
            href={`/${c.slug}`}
            className={filters.category === c.category ? "active" : undefined}
          >
            <CategoryIcon name={c.category} />
            {c.category}
          </Link>
        ))}
      </nav>

      <StoreListing
        basePath="/"
        filters={filters}
        items={items}
        total={total}
        page={page}
        totalPages={totalPages}
        heading={heading}
      />
    </>
  );
}
