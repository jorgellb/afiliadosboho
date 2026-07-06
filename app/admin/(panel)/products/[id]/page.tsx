import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductById } from "@/lib/products";
import { EditForm } from "./edit-form";

export const dynamic = "force-dynamic";

export default async function AdminEditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductById(id).catch(() => undefined);
  if (!product) notFound();

  return (
    <>
      <p>
        <Link href="/admin/products">← Volver a productos</Link>
      </p>
      <h1>Editar producto</h1>
      <p className="muted">
        Añadido el {product.createdAt.toLocaleDateString("es")} · último chequeo{" "}
        {product.lastCheckedAt.toLocaleString("es")} · {product.clicks} clics ·{" "}
        ID de AliExpress: {product.sourceProductId}
        {product.slug && (
          <>
            {" "}
            ·{" "}
            <Link href={`/producto/${product.slug}`} target="_blank">
              ver ficha pública ↗
            </Link>
          </>
        )}
      </p>
      <EditForm
        product={{
          id: product.id,
          title: product.title,
          description: product.description,
          imageUrl: product.imageUrl,
          affiliateUrl: product.affiliateUrl,
          productUrl: product.productUrl,
          price: product.price,
          originalPrice: product.originalPrice,
          currency: product.currency,
          category: product.category,
          tags: product.tags,
          available: product.available,
          isActive: product.isActive,
          slug: product.slug,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          metaTitle: product.metaTitle,
          metaDescription: product.metaDescription,
        }}
      />
    </>
  );
}
