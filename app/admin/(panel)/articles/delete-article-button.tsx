"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Borrado desde el listado, con confirmación en la propia fila: los diálogos
 * nativos del navegador se pueden bloquear y no dicen qué se va a borrar.
 */
export function DeleteArticleButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/articles/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "No se pudo eliminar");
      }
      router.refresh();
    } catch (cause) {
      // Sin esto el botón se quedaría girando para siempre si se cae la red.
      setError(cause instanceof Error ? cause.message : "Error de red");
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <>
        <button type="button" className="art-del" onClick={() => setConfirming(true)}>
          Eliminar
        </button>
        {error && <span className="art-del-error">{error}</span>}
      </>
    );
  }

  // La confirmación baja a su propia línea: en la celda de acciones no cabe
  // (la fila ya dice qué artículo es, así que no hace falta repetir el título).
  return (
    <span className="art-confirm" aria-label={`Confirmar borrado de ${title}`}>
      <span className="muted">¿Seguro?</span>
      <button type="button" className="art-del" onClick={remove} disabled={busy}>
        {busy ? "Eliminando…" : "Sí, eliminar"}
      </button>
      <button type="button" className="secondary" onClick={() => setConfirming(false)} disabled={busy}>
        No
      </button>
    </span>
  );
}
