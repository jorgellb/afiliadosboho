"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SeoBulkButton({ pending }: { pending: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function generate() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/seo", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error ?? "Error generando fichas");
      } else {
        setIsError(data.errors?.length > 0 && data.generated === 0);
        setMessage(
          `Generadas ${data.generated}` +
            (data.errors?.length ? ` · ${data.errors.length} con error (reintenta en 1 min)` : "")
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
      <button onClick={generate} disabled={loading || pending === 0}>
        {loading
          ? "Redactando…"
          : pending === 0
            ? "Todo al día ✓"
            : `Generar lote (${pending} pendientes)`}
      </button>{" "}
      {message && <span className={isError ? "error-msg" : "ok-msg"}>{message}</span>}
    </p>
  );
}
