"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface AssistantProduct {
  id: string;
  title: string;
  price: string;
  currency: string;
  originalPrice: string | null;
  imageUrl: string;
  category: string;
  source: string;
  discountPct: number | null;
  rating: string | null;
  ordersCount: number | null;
}

interface UiMessage {
  role: "user" | "assistant";
  content: string;
  products?: AssistantProduct[];
  suggestions?: string[];
}

const SUGERENCIAS = [
  "¿Qué me pongo para una boda en la playa?",
  "Móntame un look boho para un festival",
  "Busco un vestido boho por menos de 30 €",
];

function formatOrders(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

/**
 * Núcleo del chat de la estilista. `compact` activa la variante para el
 * panel flotante (tarjetas de producto en fila, alturas contenidas).
 */
export function ChatCore({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0 || loading) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, loading]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    setError(null);
    setInput("");
    const next: UiMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Solo texto de los últimos mensajes; las tarjetas no viajan.
          messages: next.slice(-10).map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Error del asistente");
        setMessages(messages);
      } else {
        setMessages([
          ...next,
          {
            role: "assistant",
            content: data.reply,
            products: data.products,
            suggestions: data.suggestions,
          },
        ]);
      }
    } catch {
      setError("Error de red");
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  }

  const lastAssistant =
    !loading &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant"
      ? messages[messages.length - 1]
      : null;

  return (
    <div className={compact ? "chat chat-compact" : "chat"}>
      {/* role="log": los mensajes nuevos se anuncian a lectores de pantalla. */}
      <div className="chat-box" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <p className="chat-hello">
              Hola, soy tu estilista boho. Dime qué buscas, para qué ocasión o tu
              presupuesto, y te monto el look con piezas de la tienda.
            </p>
            <div className="chat-suggestions">
              {SUGERENCIAS.map((s) => (
                <button key={s} className="secondary" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <p>{m.content}</p>
            {m.products && m.products.length > 0 && (
              <ul className="chat-products">
                {m.products.map((p) => (
                  <li key={p.id} className="chat-product-row">
                    <Link href={`/producto/${p.id}`} className="chat-product-media">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.imageUrl} alt={p.title} loading="lazy" />
                      {p.discountPct && p.discountPct >= 5 && (
                        <span className="chat-disc">−{p.discountPct}%</span>
                      )}
                    </Link>
                    <div>
                      <p className="chat-product-title">{p.title}</p>
                      <p className="chat-product-price">
                        {p.price} {p.currency}
                        {p.originalPrice && (
                          <span className="original">
                            {p.originalPrice} {p.currency}
                          </span>
                        )}
                      </p>
                      {((p.rating && Number(p.rating) > 0) ||
                        (p.ordersCount && p.ordersCount > 0)) && (
                        <p className="chat-product-social">
                          {p.rating && Number(p.rating) > 0 && (
                            <span className="chat-rating">
                              ★ {Math.round(Number(p.rating))}%
                            </span>
                          )}
                          {p.ordersCount && p.ordersCount > 0 && (
                            <span>{formatOrders(p.ordersCount)} vendidos</span>
                          )}
                        </p>
                      )}
                    </div>
                    <Link href={`/producto/${p.id}`} className="chat-product-link">
                      Ver →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {loading && (
          <p className="chat-thinking">
            <span className="sr-only">La estilista está escribiendo…</span>
            <span className="dot" aria-hidden />
            <span className="dot" aria-hidden />
            <span className="dot" aria-hidden />
          </p>
        )}
        {error && <p className="error-msg">{error}</p>}

        {/* Sugerencias de seguimiento bajo la última respuesta */}
        {lastAssistant?.suggestions && lastAssistant.suggestions.length > 0 && (
          <div className="chat-followups">
            {lastAssistant.suggestions.map((s) => (
              <button key={s} className="secondary" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu pregunta de moda…"
          maxLength={1000}
          disabled={loading}
          aria-label="Tu pregunta para la estilista"
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}
