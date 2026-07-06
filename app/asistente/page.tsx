"use client";

import { useRef, useState } from "react";

interface AssistantProduct {
  id: string;
  title: string;
  price: string;
  currency: string;
  originalPrice: string | null;
  imageUrl: string;
  category: string;
  source: string;
}

interface UiMessage {
  role: "user" | "assistant";
  content: string;
  products?: AssistantProduct[];
}

const SUGERENCIAS = [
  "¿Qué me pongo para una boda en la playa?",
  "Busco un vestido boho por menos de 30 €",
  "¿Cómo combino un kimono?",
];

export default function AsistentePage() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
          { role: "assistant", content: data.reply, products: data.products },
        ]);
      }
    } catch {
      setError("Error de red");
      setMessages(messages);
    } finally {
      setLoading(false);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <>
      <h1>Asistente de moda boho</h1>
      <p className="muted">
        Pídele consejos de estilo o dile qué buscas y te enseñará prendas de la
        tienda.
      </p>

      <div className="chat-box">
        {messages.length === 0 && (
          <div className="chat-suggestions">
            {SUGERENCIAS.map((s) => (
              <button key={s} className="secondary" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <p>{m.content}</p>
            {m.products && m.products.length > 0 && (
              <ul className="chat-products">
                {m.products.map((p) => (
                  <li key={p.id} className="product-card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageUrl} alt={p.title} loading="lazy" />
                    <h3>{p.title}</h3>
                    <p className="price">
                      {p.price} {p.currency}
                      {p.originalPrice && (
                        <span className="original">
                          {p.originalPrice} {p.currency}
                        </span>
                      )}
                    </p>
                    <a
                      className="buy-link"
                      href={`/go/${p.id}`}
                      target="_blank"
                      rel="nofollow sponsored noopener"
                    >
                      Comprar
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {loading && <p className="muted">Pensando…</p>}
        {error && <p className="error-msg">{error}</p>}
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
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Enviar
        </button>
      </form>
    </>
  );
}
