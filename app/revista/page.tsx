import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedArticles } from "@/lib/content";
import { SITE_NAME } from "@/lib/site";
import { SIZES, responsive } from "@/lib/images";

// El indice de la revista cambia cuando se publica un articulo: una hora
// de cache es de sobra y evita renderizarlo en cada visita.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Revista boho — guías y tendencias de moda | ${SITE_NAME}`,
  description:
    "Guías de estilo, ideas para combinar y tendencias de moda boho chic. Aprende a montar tus looks y descubre las piezas que los completan.",
};

export default async function RevistaPage() {
  const articles = await getPublishedArticles();

  return (
    <>
      <header className="revista-head">
        <p className="hero-kicker" style={{ justifyContent: "center" }}>
          La revista
        </p>
        <h1>Diario boho</h1>
        <p className="muted">
          Guías de estilo, tendencias e ideas para combinar tus piezas favoritas.
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="muted" style={{ padding: "2rem 0" }}>
          Estamos preparando los primeros artículos. Vuelve pronto.
        </p>
      ) : (
        <ul className="article-grid">
          {articles.map((a) => (
            <li key={a.id} className="article-card">
              {a.heroImageUrl && (
                <Link className="article-cover" href={`/revista/${a.slug}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    {...responsive(a.heroImageUrl, SIZES.grid)}
                    alt={a.heroImageAlt ?? a.title}
                    loading="lazy"
                    decoding="async"
                    width={640}
                    height={640}
                  />
                </Link>
              )}
              <div className="article-card-body">
                <span className="article-cat">{a.category}</span>
                <h2>
                  <Link href={`/revista/${a.slug}`}>{a.title}</Link>
                </h2>
                <p>{a.excerpt}</p>
                <Link className="article-read" href={`/revista/${a.slug}`}>
                  Leer la guía →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
