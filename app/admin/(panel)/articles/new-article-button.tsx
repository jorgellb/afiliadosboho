"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Crea un borrador con el título y abre su editor. */
export function NewArticleButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push(`/admin/articles/${data.id}`);
        return; // Se navega fuera del listado.
      }
      setError(data.error ?? "No se pudo crear");
    } catch {
      // Sin esto, un fallo de red dejaría el botón en «Creando…» para siempre.
      setError("No se pudo conectar. Revisa tu conexión.");
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Nuevo artículo
      </button>
    );
  }

  return (
    <form className="art-new" onSubmit={create}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título del artículo"
        maxLength={160}
        required
      />
      <button type="submit" disabled={busy}>
        {busy ? "Creando…" : "Crear borrador"}
      </button>
      <button type="button" className="secondary" onClick={() => setOpen(false)}>
        Cancelar
      </button>
      {error && <p className="error-msg">{error}</p>}
    </form>
  );
}
