import { getAllProductsForAdmin } from "@/lib/products";
import { ProductsTable } from "./products-table";
import { ManualAddForm } from "./manual-add-form";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await getAllProductsForAdmin();

  return (
    <>
      <h1>Productos ({products.length})</h1>
      <ProductsTable
        products={products.map((p) => ({
          id: p.id,
          title: p.title,
          seoTitle: p.seoTitle,
          slug: p.slug,
          imageUrl: p.imageUrl,
          price: p.price,
          currency: p.currency,
          category: p.category,
          tags: p.tags,
          available: p.available,
          isActive: p.isActive,
          clicks: p.clicks,
          hasSeo: p.seoTitle !== null,
          lastCheckedAt: p.lastCheckedAt.toISOString(),
        }))}
      />

      <div className="admin-card">
        <h2>Alta manual</h2>
        <p className="muted">
          Para productos de AliExpress que no aparezcan en la búsqueda. Pega la
          URL de afiliado y los datos del producto.
        </p>
        <ManualAddForm />
      </div>
    </>
  );
}
