"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ContentButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function generate() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/content", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error ?? "Error generando artículos");
      } else {
        setIsError(data.errors?.length > 0 && data.generated === 0);
        setMessage(
          `Artículos publicados: ${data.generated}` +
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
      <button onClick={generate} disabled={loading}>
        {loading ? "Redactando artículos..." : "Escribir artículos de la revista"}
      </button>{" "}
      {message && <span className={isError ? "error-msg" : "ok-msg"}>{message}</span>}
    </p>
  );
}
