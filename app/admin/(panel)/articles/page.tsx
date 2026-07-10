import Link from "next/link";
import { getAllArticles } from "@/lib/articles";
import { NewArticleButton } from "./new-article-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revista — Boho Chic" };

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default async function AdminArticlesPage() {
  const articles = await getAllArticles();
  const drafts = articles.filter((a) => !a.published).length;

  return (
    <>
      <div className="art-head">
        <div>
          <h1>La revista ({articles.length})</h1>
          {drafts > 0 && <p className="muted">{drafts} en borrador</p>}
        </div>
        <NewArticleButton />
      </div>

      {articles.length === 0 ? (
        <div className="admin-card">
          <p className="muted">
            Todavía no hay artículos. Crea uno a mano o genéralos con IA desde el
            dashboard.
          </p>
        </div>
      ) : (
        <div className="admin-card table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th></th>
                <th>Título</th>
                <th>Categoría</th>
                <th>Estado</th>
                <th>Actualizado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id}>
                  <td className="art-thumb">
                    {a.heroImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.heroImageUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="art-thumb-empty" aria-hidden />
                    )}
                  </td>
                  <td>
                    <Link href={`/admin/articles/${a.id}`} className="art-title">
                      {a.title}
                    </Link>
                    <span className="art-slug">/revista/{a.slug}</span>
                  </td>
                  <td>{a.category}</td>
                  <td>
                    <span className={a.published ? "pill pill-ok" : "pill pill-warn"}>
                      {a.published ? "Publicado" : "Borrador"}
                    </span>
                  </td>
                  <td className="muted">{formatDate(a.updatedAt)}</td>
                  <td className="table-actions">
                    <Link href={`/admin/articles/${a.id}`}>Editar</Link>
                    {a.published && (
                      <Link href={`/revista/${a.slug}`} target="_blank">
                        Ver ↗
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
