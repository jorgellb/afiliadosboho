import { getAllProductsForAdmin } from "@/lib/products";
import { ProductsTable } from "./products-table";
import { ManualAddForm } from "./manual-add-form";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await getAllProductsForAdmin();

  return (
    <>
      <h1>Gestionar productos ({products.length})</h1>
      <ProductsTable
        products={products.map((p) => ({
          id: p.id,
          source: p.source,
          title: p.title,
          imageUrl: p.imageUrl,
          price: p.price,
          currency: p.currency,
          category: p.category,
          tags: p.tags,
          available: p.available,
          isActive: p.isActive,
          clicks: p.clicks,
          lastCheckedAt: p.lastCheckedAt.toISOString(),
        }))}
      />
      <h2>Alta manual</h2>
      <p className="muted">
        Para productos que no aparezcan en la búsqueda o si una API falla. Pega
        la URL de afiliado y los datos del producto.
      </p>
      <ManualAddForm />
    </>
  );
}
