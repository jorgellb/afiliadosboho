import { getAdminStats } from "@/lib/products";
import { RefreshButton } from "./refresh-button";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const { totals, bySource, unavailableCount, recent } = await getAdminStats();
  const sourceCount = (source: string) =>
    bySource.find((s) => s.source === source)?.total ?? 0;

  return (
    <>
      <h1>Dashboard</h1>
      <div className="stats-row">
        <div className="stat">
          <strong>{totals.total}</strong> productos
        </div>
        <div className="stat">
          <strong>{sourceCount("amazon")}</strong> de Amazon
        </div>
        <div className="stat">
          <strong>{sourceCount("aliexpress")}</strong> de AliExpress
        </div>
        <div className="stat">
          <strong>{totals.clicks}</strong> clics de afiliado
        </div>
        <div className="stat">
          <strong>{unavailableCount}</strong> sin stock
        </div>
      </div>

      <RefreshButton />

      <h2>Últimos añadidos</h2>
      {recent.length === 0 ? (
        <p className="muted">
          Aún no hay productos. Ve a “Buscar productos” para añadir los primeros.
        </p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th></th>
              <th>Título</th>
              <th>Tienda</th>
              <th>Precio</th>
              <th>Clics</th>
              <th>Último chequeo</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((p) => (
              <tr key={p.id}>
                <td>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt="" />
                </td>
                <td>{p.title}</td>
                <td>{p.source}</td>
                <td>
                  {p.price} {p.currency}
                </td>
                <td>{p.clicks}</td>
                <td>{p.lastCheckedAt.toLocaleString("es")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
