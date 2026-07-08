import Link from "next/link";
import { getSeoHealth, SeoIssue } from "@/lib/seo";
import { SeoBulkButton } from "./seo-bulk-button";

export const dynamic = "force-dynamic";

function IssueGroup({
  title,
  issues,
  count,
  severity,
}: {
  title: string;
  issues: SeoIssue[];
  count: number;
  severity: "warn" | "bad" | "ok";
}) {
  return (
    <section className="seo-issue-group">
      <h2>
        {title}
        <span className={`seo-issue-count ${count === 0 ? "ok" : severity}`}>
          {count}
        </span>
      </h2>
      {issues.length === 0 ? (
        <p className="muted">Nada que corregir aquí ✓</p>
      ) : (
        <ul className="seo-issue-list">
          {issues.slice(0, 12).map((it) => (
            <li key={it.id}>
              <Link href={`/admin/products/${it.id}`}>{it.title.slice(0, 60)}</Link>
              <span className="detail">{it.detail}</span>
            </li>
          ))}
          {count > 12 && (
            <li>
              <span className="muted">y {count - 12} más…</span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export default async function SeoHealthPage() {
  const h = await getSeoHealth();

  return (
    <>
      <h1>Salud SEO</h1>

      <div className="seo-health-top">
        <div className="seo-coverage">
          <span className="muted">Cobertura de fichas</span>
          <strong>{h.coverage}%</strong>
          <div className="seo-bar" aria-hidden>
            <span style={{ width: `${h.coverage}%` }} />
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            {h.withSeo} de {h.total} productos con ficha SEO
          </p>
        </div>
        <div className="admin-card" style={{ margin: 0, flex: 1, minWidth: 260 }}>
          <h2>Generar fichas pendientes</h2>
          <p className="muted">
            El agente redacta título, meta title, meta description, descripción y
            tags de los productos que aún no tienen ficha. En lotes para respetar
            el límite de la IA.
          </p>
          <SeoBulkButton pending={h.counts.missing} />
        </div>
      </div>

      <IssueGroup
        title="Sin ficha SEO"
        issues={h.issues.missing}
        count={h.counts.missing}
        severity="bad"
      />
      <IssueGroup
        title="Meta title demasiado largo (>60)"
        issues={h.issues.titleTooLong}
        count={h.counts.titleTooLong}
        severity="warn"
      />
      <IssueGroup
        title="Meta description fuera de 120–160"
        issues={h.issues.descBadLength}
        count={h.counts.descBadLength}
        severity="warn"
      />
      <IssueGroup
        title="Sin tags / keywords"
        issues={h.issues.noTags}
        count={h.counts.noTags}
        severity="warn"
      />
      <IssueGroup
        title="Meta title duplicado"
        issues={h.issues.duplicateMeta}
        count={h.counts.duplicateMeta}
        severity="bad"
      />
    </>
  );
}
