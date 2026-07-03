"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function refresh() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/refresh", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error ?? "Error al refrescar precios");
      } else {
        setIsError(data.errors?.length > 0);
        setMessage(
          `Comprobados: ${data.checked} · actualizados: ${data.updated} · sin stock: ${data.unavailable}` +
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

  return (
    <p>
      <button onClick={refresh} disabled={loading}>
        {loading ? "Refrescando..." : "Refrescar precios ahora"}
      </button>{" "}
      {message && <span className={isError ? "error-msg" : "ok-msg"}>{message}</span>}
    </p>
  );
}
