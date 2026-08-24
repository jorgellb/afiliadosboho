import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getArticleBySlug,
  getArticleProducts,
  getRelatedArticles,
  linkifyCategories,
} from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { SIZES, responsive } from "@/lib/images";

// Un articulo publicado no cambia salvo edicion: se regenera cada hora.
export const revalidate = 3600;

/** Igual que las fichas: ISR bajo demanda, sin coste en el build. */
export async function generateStaticParams() {
  return [];
}

function formatPrice(price: string, currency: string): string {
  return new Intl.NumberFormat("es", { style: "currency", currency }).format(
    Number(price)
  );
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(decodeURIComponent(slug));
  if (!article) return { title: `Artículo no encontrado | ${SITE_NAME}` };
  const canonical = `${SITE_URL}/revista/${article.slug}`;
  return {
    title: article.metaTitle,
    description: article.metaDescription,
    alternates: { canonical },
    openGraph: {
      title: article.metaTitle,
      description: article.metaDescription,
      url: canonical,
      siteName: SITE_NAME,
      type: "article",
      ...(article.heroImageUrl ? { images: [{ url: article.heroImageUrl }] } : {}),
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getArticleBySlug(decodeURIComponent(slug));
  if (!article || !article.published) notFound();

  const [featured, related] = await Promise.all([
    getArticleProducts(article.productIds),
    getRelatedArticles(article.slug, article.category),
  ]);
  // Auto-enlazado interno de categorías dentro del cuerpo (SEO).
  const bodyHtml = renderMarkdown(linkifyCategories(article.body));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.metaDescription,
    ...(article.heroImageUrl ? { image: [article.heroImageUrl] } : {}),
    datePublished: article.createdAt.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: { "@type": "Organization", name: SITE_NAME },
    mainEntityOfPage: `${SITE_URL}/revista/${article.slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav className="breadcrumb" aria-label="Migas de pan">
        <Link href="/revista">La revista</Link>
        <span aria-hidden>/</span>
        <span>{article.category}</span>
      </nav>

      <article className="article">
        {article.heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="article-hero"
            {...responsive(article.heroImageUrl, SIZES.hero)}
            fetchPriority="high"
            decoding="async"
            width={800}
            height={800}
            // El alt escrito en el panel manda; si no lo hay, uno descriptivo.
            alt={article.heroImageAlt ?? `${article.title} — moda boho de la tienda Boho Chic`}
          />
        )}
        <p className="article-cat">{article.category}</p>
        <h1>{article.title}</h1>
        <div
          className="article-prose"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        {featured.length > 0 && (
          <section className="article-products">
            <h2>Piezas de este artículo</h2>
            <ul className="product-grid">
              {featured.map((p) => (
                <li key={p.id} className="product-card">
                  <Link
                    className="card-media"
                    href={`/producto/${p.slug ?? p.id}`}
                    aria-label={p.seoTitle ?? p.title}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      {...responsive(p.imageUrl, SIZES.thumb)}
                      alt={`${p.seoTitle ?? p.title} — ${p.category} boho`}
                      loading="lazy"
                      decoding="async"
                      width={480}
                      height={480}
                    />
                    {p.discountPct && p.discountPct >= 5 && (
                      <span className="discount-badge">−{p.discountPct}%</span>
                    )}
                  </Link>
                  <h3>
                    <Link href={`/producto/${p.slug ?? p.id}`}>
                      {p.seoTitle ?? p.title}
                    </Link>
                  </h3>
                  <p className="price">{formatPrice(p.price, p.currency)}</p>
                  <Link className="buy-link" href={`/producto/${p.slug ?? p.id}`}>
                    Ver la pieza
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {related.length > 0 && (
          <section className="article-related">
            <h2>Sigue leyendo en el Diario boho</h2>
            <ul className="article-related-list">
              {related.map((r) => (
                <li key={r.id}>
                  <Link href={`/revista/${r.slug}`}>{r.title}</Link>
                  <span className="muted">{r.excerpt}</span>
                </li>
              ))}
            </ul>
            <p>
              <Link className="buy-link" href="/revista">
                Ver todas las guías
              </Link>
            </p>
          </section>
        )}
      </article>
    </>
  );
}
