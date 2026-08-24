"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Revisión de piezas retiradas del proveedor, en dos pasos.
 *
 * El borrado es IRREVERSIBLE y en lote, así que nunca ocurre con un solo clic:
 * primero se revisa y se enseña exactamente qué se va a borrar (con sus clics
 * acumulados, para poder valorar si alguna merecía la pena), y solo entonces
 * aparece el botón de confirmar.
 */

interface Candidate {
  id: string;
  title: string;
  slug: string | null;
  category: string;
  clicks: number;
}

interface Report {
  checked: number;
  retired: Candidate[];
  newlyMissing: Candidate[];
  recovered: number;
  errors: string[];
}

export function RetiredButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function review() {
    setLoading(true);
    setMessage(null);
    setReport(null);
    try {
      const res = await fetch("/api/admin/retired", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error ?? "Error al revisar el catálogo");
      } else {
        setReport(data);
        setIsError(data.errors?.length > 0);
        setMessage(
          `Comprobadas ${data.checked} piezas · ${data.retired.length} retiradas · ` +
            `${data.newlyMissing.length} marcadas por primera vez · ${data.recovered} recuperadas` +
            (data.errors?.length ? ` · errores: ${data.errors.join(" | ")}` : "")
        );
        router.refresh();
      }
    } catch {
      setIsError(true);
      setMessage("Error de red");
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    if (!report?.retired.length) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/retired", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: report.retired.map((r) => r.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error ?? "Error al borrar");
      } else {
        setIsError(false);
        setMessage(
          `${data.deleted} pieza(s) borradas` +
            (data.skipped?.length
              ? ` · ${data.skipped.length} se saltaron (volvieron a estar disponibles)`
              : "")
        );
        setReport(null);
        router.refresh();
      }
    } catch {
      setIsError(true);
      setMessage("Error de red al borrar");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="retired-check">
      <p>
        <button onClick={review} disabled={loading || deleting}>
          {loading ? "Revisando..." : "Revisar piezas retiradas"}
        </button>{" "}
        {message && (
          <span className={isError ? "error-msg" : "ok-msg"}>{message}</span>
        )}
      </p>

      {report && report.retired.length > 0 && (
        <div className="retired-list">
          <p className="retired-warn">
            Estas {report.retired.length} piezas llevan dos comprobaciones sin
            aparecer en el proveedor. Borrarlas es <strong>irreversible</strong>{" "}
            y sus fichas dejarán de existir.
          </p>
          <ul>
            {report.retired.map((item) => (
              <li key={item.id}>
                <span className="retired-cat">{item.category}</span>{" "}
                {item.slug ? (
                  <a href={`/producto/${item.slug}`} target="_blank" rel="noopener">
                    {item.title.slice(0, 70)}
                  </a>
                ) : (
                  item.title.slice(0, 70)
                )}{" "}
                <span className="muted">· {item.clicks} clics</span>
              </li>
            ))}
          </ul>
          <button
            className="btn-danger"
            onClick={confirmDelete}
            disabled={deleting}
          >
            {deleting
              ? "Borrando..."
              : `Borrar definitivamente estas ${report.retired.length}`}
          </button>
        </div>
      )}

      {report && report.retired.length === 0 && report.newlyMissing.length > 0 && (
        <p className="muted">
          Nada que borrar todavía. {report.newlyMissing.length} pieza(s) han
          faltado por primera vez y quedan marcadas como no disponibles: si
          siguen ausentes en la próxima revisión, aparecerán aquí para borrar.
        </p>
      )}
    </div>
  );
}
