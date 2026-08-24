import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  COLLECTIONS,
  getCollectionBySlug,
} from "@/lib/collections";
import { getArticlesForCategory } from "@/lib/content";
import { getStoreProducts, parseStoreFilters } from "@/lib/products";
import { SITE_URL } from "@/lib/site";
import { CategoryIcon } from "../components/category-icon";
import { StoreListing } from "../components/store-listing";

/**
 * Página de colección: /vestidos-boho, /joyeria-boho…
 *
 * Sustituye a `/?category=vestidos`, que compartía title con la home y no
 * tenía H1. Este segmento dinámico vive en la raíz, así que Next resuelve
 * antes cualquier ruta estática (/quiz, /revista, /producto…); lo que no sea
 * una colección conocida cae en notFound() y devuelve un 404 real.
 */

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ coleccion: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/** Un filtro activo convierte el listado en una vista que no debe indexarse. */
function hasFilters(sp: { [key: string]: string | string[] | undefined }) {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  return Boolean(
    one(sp.q) ||
      one(sp.min) ||
      one(sp.max) ||
      (one(sp.sort) && one(sp.sort) !== "recientes")
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { coleccion } = await params;
  const collection = getCollectionBySlug(coleccion);
  if (!collection) return {};

  const sp = await searchParams;
  const page = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1;
  const filtered = hasFilters(sp);

  // La canónica apunta siempre a la URL limpia de la colección. La paginación
  // sí se apunta a sí misma (Google trata cada página como contenido propio);
  // las combinaciones de filtros, en cambio, se retiran del índice: no tienen
  // demanda de búsqueda y multiplicarían URLs casi idénticas.
  const canonical =
    page > 1 ? `/${collection.slug}?page=${page}` : `/${collection.slug}`;

  return {
    title: collection.title,
    description: collection.description,
    alternates: { canonical },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: collection.title,
      description: collection.description,
      url: `${SITE_URL}/${collection.slug}`,
      type: "website",
    },
  };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { coleccion } = await params;
  const collection = getCollectionBySlug(coleccion);
  if (!collection) notFound();

  // La categoría la manda la ruta: se ignora cualquier `category` de la query
  // para que no existan dos URLs con el mismo listado.
  const raw = await searchParams;
  const filters = {
    ...parseStoreFilters(raw),
    category: collection.category,
  };
  const [{ items, total, page, totalPages }, articles] = await Promise.all([
    getStoreProducts(filters),
    getArticlesForCategory(collection.category, 3),
  ]);

  // Colecciones que combinan con esta, resueltas desde su slug.
  const related = collection.related
    .map((slug) => COLLECTIONS.find((c) => c.slug === slug))
    .filter((c): c is (typeof COLLECTIONS)[number] => c !== undefined);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "La tienda",
        item: `${SITE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: collection.name,
        item: `${SITE_URL}/${collection.slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <nav className="breadcrumb" aria-label="Migas de pan">
        <Link href="/">La tienda</Link>
        <span aria-hidden>/</span>
        <span aria-current="page">{collection.name}</span>
      </nav>

      <header className="collection-head">
        <p className="hero-kicker">Colección</p>
        <h1>{collection.heading}</h1>
        <div className="collection-intro">
          {collection.intro.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </header>

      <nav className="collections" aria-label="Colecciones">
        {COLLECTIONS.map((c) => (
          <Link
            key={c.slug}
            href={`/${c.slug}`}
            className={c.slug === collection.slug ? "active" : undefined}
            aria-current={c.slug === collection.slug ? "page" : undefined}
          >
            <CategoryIcon name={c.category} />
            {c.category}
          </Link>
        ))}
      </nav>

      <StoreListing
        basePath={`/${collection.slug}`}
        filters={filters}
        items={items}
        total={total}
        page={page}
        totalPages={totalPages}
        heading={collection.heading}
        categoryInPath
      />

      {articles.length > 0 && (
        <section className="collection-reading">
          <h2>Sobre {collection.name.toLowerCase()} en la Revista</h2>
          <ul>
            {articles.map((article) => (
              <li key={article.slug}>
                <Link href={`/revista/${article.slug}`}>{article.title}</Link>
                {article.excerpt && (
                  <p className="muted">{article.excerpt.slice(0, 130)}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="collection-related">
          <h2>Combina {collection.name.toLowerCase()} con</h2>
          <nav className="collections" aria-label="Colecciones relacionadas">
            {related.map((c) => (
              <Link key={c.slug} href={`/${c.slug}`}>
                <CategoryIcon name={c.category} />
                {c.name}
              </Link>
            ))}
          </nav>
        </section>
      )}
    </>
  );
}
