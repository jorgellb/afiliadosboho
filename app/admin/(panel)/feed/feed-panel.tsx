"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FeedStats } from "@/lib/feed";

interface Broken {
  id: string;
  title: string;
  errors: string[];
}

interface Props {
  feedPath: string;
  feedUrl: string;
  initialStats: FeedStats;
  broken: Broken[];
}

export function FeedPanel({ feedPath, feedUrl, initialStats, broken }: Props) {
  const router = useRouter();
  const [stats, setStats] = useState(initialStats);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [brand, setBrand] = useState("Boho Chic");

  async function call(action: "refresh" | "set-brand") {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "set-brand" ? { action, brand } : { action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: "error", text: data.error ?? "No se pudo actualizar" });
        return;
      }
      setStats(data.stats);
      setMsg({
        kind: "ok",
        text:
          action === "set-brand"
            ? `Marca puesta en ${data.filled} producto${data.filled === 1 ? "" : "s"}. El feed tiene ${data.items} artículos.`
            : `Feed comprobado: ${data.items} productos listos para subir.`,
      });
      router.refresh();
    } catch {
      // Sin esto, un fallo de red dejaría el botón girando para siempre.
      setMsg({ kind: "error", text: "No se pudo conectar. Revisa tu conexión." });
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg({ kind: "error", text: "El navegador no dejó copiar. Selecciónala a mano." });
    }
  }

  const sinMarca = stats.byIssue.find((i) => i.field === "brand")?.count ?? 0;

  return (
    <>
      <div className="admin-card">
        <div className="feed-head">
          <div>
            <h2>Estado del feed</h2>
            <p className="muted">Se genera al vuelo: siempre refleja el catálogo actual.</p>
          </div>
          <button type="button" onClick={() => call("refresh")} disabled={busy !== null}>
            {busy === "refresh" ? "Comprobando…" : "Comprobar el feed ahora"}
          </button>
        </div>

        {msg && <p className={msg.kind === "ok" ? "ok-msg" : "error-msg"}>{msg.text}</p>}

        <div className="feed-stats">
          <div className="stat">
            <span className="stat-num">{stats.eligible}</span>
            <span className="stat-label">en el feed</span>
          </div>
          <div className="stat">
            <span className="stat-num">{stats.withErrors}</span>
            <span className="stat-label">rechazados</span>
          </div>
          <div className="stat">
            <span className="stat-num">{stats.withWarnings}</span>
            <span className="stat-label">con avisos</span>
          </div>
          <div className="stat">
            <span className="stat-num">{stats.excluded}</span>
            <span className="stat-label">fuera a propósito</span>
          </div>
        </div>

        <label htmlFor="feed-url">URL del feed</label>
        <div className="feed-url-row">
          <input id="feed-url" readOnly value={feedUrl} onFocus={(e) => e.target.select()} />
          <button type="button" className="secondary" onClick={copy}>
            {copied ? "Copiada ✓" : "Copiar"}
          </button>
          <a className="secondary-btn" href={feedPath} target="_blank" rel="noreferrer">
            Ver XML ↗
          </a>
        </div>
      </div>

      {sinMarca > 0 && (
        <div className="admin-card">
          <h2>Marca</h2>
          <p className="muted">
            Google exige marca en ropa y AliExpress casi nunca la da.{" "}
            <strong>{sinMarca} producto{sinMarca === 1 ? "" : "s"}</strong> no la
            tienen: ahora mismo el feed envía «Boho Chic» por ellos. Puedes
            fijarla de una vez.
          </p>
          <div className="feed-url-row">
            <input
              value={brand}
              maxLength={70}
              onChange={(e) => setBrand(e.target.value)}
              aria-label="Marca para los productos que no la tienen"
            />
            <button
              type="button"
              onClick={() => call("set-brand")}
              disabled={busy !== null || brand.trim() === ""}
            >
              {busy === "set-brand" ? "Guardando…" : `Ponerla en los ${sinMarca}`}
            </button>
          </div>
        </div>
      )}

      {stats.byIssue.length > 0 && (
        <div className="admin-card">
          <h2>Incidencias</h2>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nivel</th>
                  <th>Atributo</th>
                  <th>Qué pasa</th>
                  <th>Productos</th>
                </tr>
              </thead>
              <tbody>
                {stats.byIssue.map((issue) => (
                  <tr key={`${issue.level}-${issue.field}`}>
                    <td>
                      <span className={issue.level === "error" ? "pill pill-warn" : "pill pill-muted"}>
                        {issue.level === "error" ? "Rechaza" : "Aviso"}
                      </span>
                    </td>
                    <td>
                      <code>{issue.field}</code>
                    </td>
                    <td>{issue.message}</td>
                    <td>{issue.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {broken.length > 0 && (
        <div className="admin-card">
          <h2>Productos que Google rechazaría</h2>
          <ul className="feed-broken">
            {broken.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/products/${b.id}`}>{b.title}</Link>
                <span className="muted">{b.errors.join(" · ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
