"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CurateButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function curate() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/curate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perCategory: 3 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error ?? "Error al curar el catálogo");
      } else {
        setIsError(false);
        const detail = Object.entries(data.added ?? {})
          .filter(([, n]) => (n as number) > 0)
          .map(([c, n]) => `${c}: ${n}`)
          .join(", ");
        setMessage(
          `Añadidos ${data.totalAdded} productos${detail ? ` (${detail})` : ""}` +
            (data.errors?.length ? ` · errores: ${data.errors.length}` : "")
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

  return (
    <p>
      <button onClick={curate} disabled={loading}>
        {loading ? "Curando catálogo..." : "Añadir productos con IA"}
      </button>{" "}
      {message && <span className={isError ? "error-msg" : "ok-msg"}>{message}</span>}
    </p>
  );
}
