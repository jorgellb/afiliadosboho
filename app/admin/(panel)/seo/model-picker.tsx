"use client";

import { useEffect, useState } from "react";

/**
 * Selector del modelo gratuito de OpenRouter que redacta las fichas SEO.
 *
 * El catálogo se pide en vivo a OpenRouter en vez de mantener una lista en el
 * código: los modelos gratuitos entran y salen constantemente, y uno retirado
 * devuelve 404.
 *
 * El botón de probar es lo que hace útil al selector. Un modelo puede contestar
 * rápido a un saludo y devolver JSON roto ante el prompt real, que es largo y
 * con reglas estrictas de longitud. Aquí se lanza ESE prompt y se enseña qué
 * redactó, cuánto tardó y si el JSON era válido, para poder comparar antes de
 * fijar nada.
 */

interface Model {
  id: string;
  name: string;
  contextLength: number;
  supportsTools: boolean;
}

interface TestResult {
  ok: boolean;
  segundos: number;
  jsonValido?: boolean;
  titulo?: string | null;
  metaDescription?: string | null;
  descripcion?: string | null;
  bruto?: string | null;
  error?: string;
}

export function ModelPicker() {
  const [models, setModels] = useState<Model[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [saved, setSaved] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/seo-model")
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (d.error) {
          setError(d.error);
        } else {
          setModels(d.models ?? []);
          setSelected(d.selected ?? "");
          setSaved(d.selected ?? null);
          setConfigured(Boolean(d.openRouterConfigured));
        }
      })
      .catch(() => vivo && setError("No se pudo consultar el catálogo"))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, []);

  async function probar() {
    if (!selected) return;
    setTesting(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch("/api/admin/seo-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selected }),
      });
      const d = await r.json();
      if (d.error && !("ok" in d)) setError(d.error);
      else setResult(d);
    } catch {
      setError("Error de red al probar");
    } finally {
      setTesting(false);
    }
  }

  async function guardar() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/seo-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selected || null }),
      });
      const d = await r.json();
      if (d.error) setError(d.error);
      else setSaved(d.selected ?? null);
    } catch {
      setError("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted">Cargando catálogo de modelos…</p>;

  return (
    <div className="model-picker">
      {!configured && (
        <p className="error-msg">
          Falta <code>OPENROUTER_API_KEY</code>: se puede elegir modelo, pero no
          se usará ni se podrá probar hasta que la configures.
        </p>
      )}

      <div className="model-picker-row">
        <label htmlFor="seo-model">Modelo que redacta las fichas</label>
        <select
          id="seo-model"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setResult(null);
          }}
        >
          <option value="">Automático (orden por defecto)</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {Math.round(m.contextLength / 1000)}k
              {m.supportsTools ? "" : " · sin tools"}
            </option>
          ))}
        </select>
      </div>

      <p>
        <button onClick={probar} disabled={!selected || testing || saving}>
          {testing ? "Probando…" : "Probar con el prompt real"}
        </button>{" "}
        <button onClick={guardar} disabled={saving || testing}>
          {saving ? "Guardando…" : "Usar este modelo"}
        </button>{" "}
        {saved !== null ? (
          <span className="ok-msg">En uso: {saved}</span>
        ) : (
          <span className="muted">En uso: orden automático</span>
        )}
      </p>

      {error && <p className="error-msg">{error}</p>}

      {result && (
        <div className={`model-test ${result.ok && result.jsonValido ? "ok" : "bad"}`}>
          {!result.ok ? (
            <p className="error-msg">
              Falló tras {result.segundos}s: {result.error}
            </p>
          ) : (
            <>
              <p>
                <strong>{result.segundos}s</strong> ·{" "}
                {result.jsonValido ? "JSON válido ✓" : "JSON INVÁLIDO ✗"}
              </p>
              {result.jsonValido ? (
                <dl>
                  <dt>Título</dt>
                  <dd>{String(result.titulo ?? "—")}</dd>
                  <dt>Meta description</dt>
                  <dd>
                    {String(result.metaDescription ?? "—")}{" "}
                    <span className="muted">
                      ({String(result.metaDescription ?? "").length} caracteres)
                    </span>
                  </dd>
                  <dt>Descripción</dt>
                  <dd>{String(result.descripcion ?? "—")}</dd>
                </dl>
              ) : (
                <pre>{result.bruto}</pre>
              )}
            </>
          )}
        </div>
      )}

      <p className="muted">
        Elijas el que elijas, si falla se prueban los siguientes de la cadena:
        una elección desafortunada no deja el catálogo sin fichas.
      </p>
    </div>
  );
}
