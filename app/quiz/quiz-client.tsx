"use client";

import { useState } from "react";
import Link from "next/link";
import { QUESTIONS } from "@/lib/quiz";

interface FeedProduct {
  id: string;
  slug: string | null;
  title: string;
  price: string;
  currency: string;
  originalPrice: string | null;
  imageUrl: string;
  discountPct: number | null;
}

interface Result {
  profile: string;
  name: string;
  tagline: string;
  products: FeedProduct[];
}

function formatPrice(price: string, currency: string): string {
  return new Intl.NumberFormat("es", { style: "currency", currency }).format(
    Number(price)
  );
}

export function QuizClient() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Captura de email
  const [email, setEmail] = useState("");
  const [subState, setSubState] = useState<"idle" | "ok" | "error">("idle");
  const [subMsg, setSubMsg] = useState<string | null>(null);

  async function choose(optionIndex: number) {
    const next = [...answers, optionIndex];
    setAnswers(next);
    if (next.length < QUESTIONS.length) {
      setStep(step + 1);
      return;
    }
    // Última respuesta → calcular perfil.
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Error calculando tu estilo");
      else setResult(data);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setStep(0);
    setAnswers([]);
    setResult(null);
    setError(null);
    setSubState("idle");
    setSubMsg(null);
  }

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    setSubMsg(null);
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        source: "quiz",
        styleResult: result?.name ?? null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSubState("ok");
      setSubMsg("¡Listo! Te enviaremos tu selección y las novedades boho.");
    } else {
      setSubState("error");
      setSubMsg(data.error ?? "No se pudo completar la suscripción");
    }
  }

  // --- Resultado ---
  if (result) {
    return (
      <div className="quiz">
        <p className="hero-kicker">Tu estilo es</p>
        <h1 className="quiz-result-name">{result.name}</h1>
        <p className="quiz-tagline">{result.tagline}</p>

        {subState !== "ok" ? (
          <form className="quiz-capture" onSubmit={subscribe}>
            <label htmlFor="quiz-email">
              Recibe esta selección y las novedades de tu estilo
            </label>
            <div className="quiz-capture-row">
              <input
                id="quiz-email"
                type="email"
                required
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button type="submit">Enviármela</button>
            </div>
            {/* Consentimiento explícito y sin premarcar (RGPD art. 6.1.a). */}
            <label className="quiz-consent">
              <input type="checkbox" name="consent" required />
              <span>
                Acepto que se traten mi correo y mi perfil de estilo para
                recibir esta selección y las novedades, según la{" "}
                <Link href="/privacidad">política de privacidad</Link>. Puedo
                darme de baja cuando quiera.
              </span>
            </label>
            {subState === "error" && subMsg && (
              <p className="error-msg">{subMsg}</p>
            )}
          </form>
        ) : (
          <p className="ok-msg quiz-capture">{subMsg}</p>
        )}

        <h2 className="quiz-feed-title">Elegido para ti</h2>
        {result.products.length === 0 ? (
          <p className="muted">
            Aún estamos ampliando esta selección. Mientras, explora{" "}
            <Link href="/">toda la tienda</Link>.
          </p>
        ) : (
          <ul className="product-grid">
            {result.products.map((p) => {
              const href = `/producto/${p.slug ?? p.id}`;
              return (
                <li key={p.id} className="product-card">
                  <Link className="card-media" href={href} aria-label={p.title}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.imageUrl} alt={p.title} loading="lazy" />
                    {p.discountPct && p.discountPct >= 5 && (
                      <span className="discount-badge">−{p.discountPct}%</span>
                    )}
                  </Link>
                  <h3>
                    <Link href={href}>{p.title}</Link>
                  </h3>
                  <p className="price">
                    {formatPrice(p.price, p.currency)}
                    {p.originalPrice && (
                      <span className="original">
                        {formatPrice(p.originalPrice, p.currency)}
                      </span>
                    )}
                  </p>
                  <Link className="buy-link" href={href}>
                    Ver la pieza
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="quiz-restart">
          <button className="secondary" onClick={restart}>
            Repetir el test
          </button>
        </p>
      </div>
    );
  }

  // --- Cargando ---
  if (loading) {
    return (
      <div className="quiz quiz-loading">
        <p className="hero-kicker">Analizando tus respuestas…</p>
        <h1>Buscando tu estilo boho</h1>
      </div>
    );
  }

  // --- Preguntas ---
  const q = QUESTIONS[step];
  const progress = Math.round((step / QUESTIONS.length) * 100);

  return (
    <div className="quiz">
      <p className="hero-kicker">
        Test de estilo · {step + 1} de {QUESTIONS.length}
      </p>
      <div className="quiz-progress" aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </div>
      <h1 className="quiz-question">{q.question}</h1>
      {error && <p className="error-msg">{error}</p>}
      <ul className="quiz-options">
        {q.options.map((o, i) => (
          <li key={i}>
            <button onClick={() => choose(i)}>{o.label}</button>
          </li>
        ))}
      </ul>
      {step > 0 && (
        <p>
          <button
            className="secondary quiz-back"
            onClick={() => {
              setAnswers(answers.slice(0, -1));
              setStep(step - 1);
            }}
          >
            ← Anterior
          </button>
        </p>
      )}
    </div>
  );
}
