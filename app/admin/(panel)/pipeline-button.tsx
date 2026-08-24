"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Dispara a mano el mismo pipeline que corre cada día a las 05:00: buscar
 * piezas en las nueve categorías, redactar las fichas SEO pendientes y
 * reindexar el buscador.
 *
 * Se enseña la cadena de proveedores de IA que acabó usándose, porque saber
 * si respondió OpenRouter o si hubo que caer a NVIDIA es lo que avisa de que
 * se está agotando el cupo gratuito.
 */

interface Summary {
  catalog: { added: Record<string, number>; totalAdded: number; errors: string[] };
  seo: { generated: number; errors: string[] };
  reindexed: number | null;
  llm: string[];
  errors: string[];
}

export function PipelineButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function run() {
    setLoading(true);
    setMessage(null);
    setDetail(null);
    try {
      const res = await fetch("/api/admin/pipeline", { method: "POST" });
      const data: Summary = await res.json().catch(() => ({}) as Summary);
      if (!res.ok) {
        setIsError(true);
        setMessage("Error al ejecutar el pipeline");
        return;
      }
      const porCategoria = Object.entries(data.catalog?.added ?? {})
        .filter(([, n]) => n > 0)
        .map(([c, n]) => `${c} ${n}`)
        .join(", ");
      const fallos = [
        ...(data.errors ?? []),
        ...(data.catalog?.errors ?? []),
        ...(data.seo?.errors ?? []),
      ];
      setIsError(fallos.length > 0);
      setMessage(
        `${data.catalog?.totalAdded ?? 0} piezas nuevas · ` +
          `${data.seo?.generated ?? 0} fichas redactadas` +
          (data.reindexed !== null ? ` · ${data.reindexed} reindexadas` : "")
      );
      setDetail(
        [
          porCategoria && `Por categoría: ${porCategoria}`,
          data.llm?.length && `IA: ${data.llm.join(" → ")}`,
          fallos.length > 0 && `Incidencias: ${fallos.slice(0, 3).join(" | ")}`,
        ]
          .filter(Boolean)
          .join(" · ")
      );
      router.refresh();
    } catch {
      setIsError(true);
      setMessage("Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p>
        <button onClick={run} disabled={loading}>
          {loading ? "Ejecutando…" : "Ejecutar pipeline diario ahora"}
        </button>{" "}
        {message && (
          <span className={isError ? "error-msg" : "ok-msg"}>{message}</span>
        )}
      </p>
      {detail && <p className="muted">{detail}</p>}
    </div>
  );
}
