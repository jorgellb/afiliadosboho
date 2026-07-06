import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlugOrId, getRelatedProducts } from "@/lib/products";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  aliexpress: "AliExpress",
};

function formatPrice(price: string, currency: string): string {
  return new Intl.NumberFormat("es", { style: "currency", currency }).format(
    Number(price)
  );
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlugOrId(decodeURIComponent(slug));
  if (!product) return { title: `Producto no encontrado | ${SITE_NAME}` };

  const title =
    product.metaTitle ?? `${product.seoTitle ?? product.title} | ${SITE_NAME}`;
  const description =
    product.metaDescription ??
    `${(product.seoTitle ?? product.title).slice(0, 90)} al mejor precio en ${SITE_NAME}. Moda boho seleccionada de ${SOURCE_LABELS[product.source]}.`;
  const canonical = `${SITE_URL}/producto/${product.slug ?? product.id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      images: [{ url: product.imageUrl }],
      type: "website",
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlugOrId(decodeURIComponent(slug));
  if (!product || !product.isActive) notFound();

  const related = await getRelatedProducts(product.category, product.id);
  const displayTitle = product.seoTitle ?? product.title;
  const discount =
    product.originalPrice !== null
      ? Math.round(
          (1 - Number(product.price) / Number(product.originalPrice)) * 100
        )
      : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: displayTitle,
    image: [product.imageUrl],
    description:
      product.metaDescription ?? product.seoDescription ?? product.title,
    category: product.category,
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/producto/${product.slug ?? product.id}`,
      priceCurrency: product.currency,
      price: product.price,
      availability: product.available
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="breadcrumb" aria-label="Migas de pan">
        <Link href="/">La tienda</Link>
        <span aria-hidden>/</span>
        <Link href={`/?category=${product.category}`}>{product.category}</Link>
      </nav>

      <article className="ficha">
        <figure className="ficha-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.imageUrl} alt={displayTitle} />
          {discount !== null && discount > 4 && (
            <span className="ficha-discount">−{discount}%</span>
          )}
        </figure>

        <div className="ficha-body">
          <p className="ficha-kicker">
            {product.category} · {SOURCE_LABELS[product.source]}
          </p>
          <h1>{displayTitle}</h1>
          <p className="ficha-price">
            {formatPrice(product.price, product.currency)}
            {product.originalPrice && (
              <span className="original">
                {formatPrice(product.originalPrice, product.currency)}
              </span>
            )}
          </p>

          {product.seoDescription ? (
            <div className="ficha-copy">
              {product.seoDescription.split(/\n+/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : (
            <div className="ficha-copy">
              <p className="muted">
                Una pieza {product.category !== "otros" ? `de ${product.category} ` : ""}
                de nuestra selección boho, disponible en{" "}
                {SOURCE_LABELS[product.source]}.
              </p>
            </div>
          )}

          <div className="ficha-actions">
            <a
              className="btn-primary"
              href={`/go/${product.id}`}
              target="_blank"
              rel="nofollow sponsored noopener"
            >
              Comprar en {SOURCE_LABELS[product.source]} →
            </a>
            {!product.available && (
              <span className="error-msg">Agotado temporalmente</span>
            )}
          </div>

          <dl className="ficha-details">
            <div>
              <dt>Tienda</dt>
              <dd>{SOURCE_LABELS[product.source]}</dd>
            </div>
            <div>
              <dt>Colección</dt>
              <dd>{product.category}</dd>
            </div>
            <div>
              <dt>Disponibilidad</dt>
              <dd>{product.available ? "En stock" : "Agotado"}</dd>
            </div>
          </dl>

          <p className="muted ficha-disclosure">
            Enlace de afiliado: la compra se completa en{" "}
            {SOURCE_LABELS[product.source]} y puede generarnos una comisión sin
            coste extra para ti.
          </p>
        </div>
      </article>

      {related.length > 0 && (
        <section className="related">
          <h2>También de esta colección</h2>
          <ul className="product-grid">
            {related.map((p) => (
              <li key={p.id} className="product-card">
                <Link
                  className="card-media"
                  href={`/producto/${p.slug ?? p.id}`}
                  aria-label={p.seoTitle ?? p.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt={p.seoTitle ?? p.title} loading="lazy" />
                </Link>
                <h3>{p.seoTitle ?? p.title}</h3>
                <p className="price">{formatPrice(p.price, p.currency)}</p>
                <Link className="buy-link" href={`/producto/${p.slug ?? p.id}`}>
                  Ver la pieza
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
