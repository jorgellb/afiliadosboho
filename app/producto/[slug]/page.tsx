import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getLookForProduct,
  getProductBySlugOrId,
  getRelatedProducts,
} from "@/lib/products";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { getCollectionByCategory } from "@/lib/collections";
import { DiscountBadge, SocialRow } from "../../components/social-proof";

export const dynamic = "force-dynamic";

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
    `${(product.seoTitle ?? product.title).slice(0, 90)} al mejor precio en ${SITE_NAME}. Moda boho seleccionada pieza a pieza.`;
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

  const [related, look] = await Promise.all([
    getRelatedProducts(product.category, product.id),
    getLookForProduct(product),
  ]);
  const displayTitle = product.seoTitle ?? product.title;
  const computedDiscount =
    product.originalPrice !== null
      ? Math.round(
          (1 - Number(product.price) / Number(product.originalPrice)) * 100
        )
      : null;
  const discountPct = product.discountPct ?? computedDiscount;

  const lookTotal = [product, ...look].reduce(
    (sum, p) => sum + Number(p.price),
    0
  );

  const collection = getCollectionByCategory(product.category);

  // BreadcrumbList: la ruta Inicio > Colección > Producto que Google muestra
  // en la SERP en lugar de la URL cruda. Refleja las migas visibles.
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "La tienda", item: `${SITE_URL}/` },
      ...(collection
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: collection.name,
              item: `${SITE_URL}/${collection.slug}`,
            },
          ]
        : []),
      {
        "@type": "ListItem",
        position: collection ? 3 : 2,
        name: displayTitle,
        item: `${SITE_URL}/producto/${product.slug ?? product.id}`,
      },
    ],
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: displayTitle,
    image: [product.imageUrl],
    description:
      product.metaDescription ?? product.seoDescription ?? product.title,
    category: product.category,
    // SIN aggregateRating a propósito. El dato del proveedor es un
    // PORCENTAJE de valoraciones positivas, y la página lo muestra como tal
    // ("★ 95%"); convertirlo a una nota sobre 5 haría que los datos
    // estructurados no coincidieran con el contenido visible. Además
    // ordersCount son VENTAS, no reseñas, y no hay sistema de reseñas propio.
    // Marcarlo sería exponerse a una acción manual por reseñas falsas.
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
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([jsonLd, breadcrumbLd]),
        }}
      />

      <nav className="breadcrumb" aria-label="Migas de pan">
        <Link href="/">La tienda</Link>
        <span aria-hidden>/</span>
        {collection ? (
          <Link href={`/${collection.slug}`}>{collection.name}</Link>
        ) : (
          <Link href={`/?category=${product.category}`}>{product.category}</Link>
        )}
        <span aria-hidden>/</span>
        <span aria-current="page">{displayTitle}</span>
      </nav>

      <article className="ficha">
        <figure className="ficha-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.imageUrl} alt={displayTitle} />
          {discountPct !== null && discountPct >= 5 && (
            <span className="ficha-discount">−{discountPct}%</span>
          )}
        </figure>

        <div className="ficha-body">
          <p className="ficha-kicker">Colección · {product.category}</p>
          <h1>{displayTitle}</h1>
          <SocialRow
            rating={product.rating}
            ordersCount={product.ordersCount}
            discountPct={product.discountPct}
          />
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
                de nuestra selección boho.
              </p>
            </div>
          )}

          {/* El aviso va ANTES del primer CTA monetizado: quien pulsa
              "Comprar" ya ha leído que el enlace es de afiliado. */}
          <p className="muted ficha-disclosure">
            Este enlace es de afiliado: si compras a través de él podemos
            recibir una comisión, sin coste adicional para ti. La compra se
            completa en la web de nuestro socio comercial.
          </p>

          <div className="ficha-actions">
            <a
              className="btn-primary"
              href={`/go/${product.id}?src=ficha`}
              target="_blank"
              rel="nofollow sponsored noopener"
            >
              Comprar esta pieza →
            </a>
            {!product.available && (
              <span className="error-msg">Agotado temporalmente</span>
            )}
          </div>

          <dl className="ficha-details">
            <div>
              <dt>Colección</dt>
              <dd>{product.category}</dd>
            </div>
            <div>
              <dt>Disponibilidad</dt>
              <dd>{product.available ? "En stock" : "Agotado"}</dd>
            </div>
          </dl>
        </div>
      </article>

      {look.length >= 2 && (
        <section className="look">
          <div className="look-head">
            <p className="hero-kicker">El look completo</p>
            <h2>Combínala así</h2>
            <p className="muted">
              Nuestra estilista ha montado un conjunto boho alrededor de esta
              pieza. Llévate el look entero por{" "}
              <strong>{formatPrice(lookTotal.toFixed(2), product.currency)}</strong>.
            </p>
          </div>
          <ol className="look-grid">
            <li className="look-item look-hero">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.imageUrl} alt={displayTitle} />
              <div>
                <span className="look-role">La pieza</span>
                <p className="look-title">{displayTitle}</p>
                <p className="price">{formatPrice(product.price, product.currency)}</p>
              </div>
            </li>
            {look.map((p) => (
              <li key={p.id} className="look-item">
                <Link href={`/producto/${p.slug ?? p.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt={p.seoTitle ?? p.title} loading="lazy" />
                </Link>
                <div>
                  <span className="look-role">{p.category}</span>
                  <p className="look-title">
                    <Link href={`/producto/${p.slug ?? p.id}`}>
                      {p.seoTitle ?? p.title}
                    </Link>
                  </p>
                  <p className="price">{formatPrice(p.price, p.currency)}</p>
                  <a
                    className="buy-link"
                    href={`/go/${p.id}?src=look`}
                    target="_blank"
                    rel="nofollow sponsored noopener"
                  >
                    Añadir al look
                  </a>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

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
                  <DiscountBadge discountPct={p.discountPct} />
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
