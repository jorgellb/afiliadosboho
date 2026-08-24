import Link from "next/link";
import { getAdminStats } from "@/lib/products";
import { RefreshButton } from "./refresh-button";
import { CurateButton } from "./curate-button";
import { SeoButton } from "./seo-button";
import { ContentButton } from "./content-button";
import { RetiredButton } from "./retired-button";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const {
    totals,
    unavailableCount,
    missingSeoCount,
    subscribersCount,
    clickSplit,
    recent,
  } = await getAdminStats();

  return (
    <>
      <h1>Dashboard</h1>
      <div className="stats-row">
        <div className="stat">
          <strong>{totals.total}</strong> productos
        </div>
        <div className="stat">
          <strong>{clickSplit.humans}</strong> clics humanos
        </div>
        <div
          className="stat"
          title="Rastreadores automaticos: se redirigen igual, pero no cuentan como interes de compra"
        >
          <strong>{clickSplit.bots}</strong> clics de bots
        </div>
        <div className="stat">
          <strong>{unavailableCount}</strong> sin stock
        </div>
        <div className="stat">
          <strong>{missingSeoCount}</strong> sin ficha SEO
        </div>
        <div className="stat">
          <strong>{subscribersCount}</strong> suscriptores
        </div>
      </div>

      {clickSplit.unclassified > 0 && (
        <p className="muted">
          Hay {clickSplit.unclassified} clics anteriores a la deteccion de bots
          que no se pueden clasificar: mezclan personas y rastreadores, asi que
          no se suman a ninguna de las dos cifras.
        </p>
      )}

      <div className="admin-card">
        <h2>Acciones del agente</h2>
        <p className="muted">
          El agente trabaja sobre AliExpress: añade productos por categoría,
          refresca precios y redacta las fichas SEO pendientes.
        </p>
        <CurateButton />
        <SeoButton />
        <ContentButton />
        <RefreshButton />
        <RetiredButton />
      </div>

      <div className="admin-card">
        <h2>Últimos añadidos</h2>
        {recent.length === 0 ? (
          <p className="muted">
            Aún no hay productos. Ve a “Buscar en AliExpress” para añadir los
            primeros.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Título</th>
                  <th>Precio</th>
                  <th>Categoría</th>
                  <th>Ficha SEO</th>
                  <th>Clics</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.imageUrl} alt="" />
                    </td>
                    <td>{p.seoTitle ?? p.title}</td>
                    <td>
                      {p.price} {p.currency}
                    </td>
                    <td>{p.category}</td>
                    <td>{p.seoTitle ? "✓" : "—"}</td>
                    <td>{p.clicks}</td>
                    <td>
                      <Link href={`/admin/products/${p.id}`}>Editar</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
