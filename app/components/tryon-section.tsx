"use client";

import { useState } from "react";
import { ARTryOn } from "./ar-tryon";

interface Product {
  id: string;
  title: string;
  imageUrl: string;
}

interface Suggestion {
  id: string;
  slug: string | null;
  title: string;
  price: string;
  currency: string;
  imageUrl: string;
  reason: string;
}

function formatPrice(price: string, currency: string): string {
  return new Intl.NumberFormat("es", { style: "currency", currency }).format(
    Number(price)
  );
}

export function TryonSection({ product }: { product: Product }) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loadingSug, setLoadingSug] = useState(false);

  async function openTryon() {
    setOpen(true);
    if (suggestions === null && !loadingSug) {
      setLoadingSug(true);
      try {
        const res = await fetch(`/api/tryon/stylist?productId=${product.id}`);
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSug(false);
      }
    }
  }

  if (!open) {
    return (
      <div className="tryon-cta">
        <button className="btn-primary" onClick={openTryon}>
          ✦ Probártelo con la cámara
        </button>
        <p className="muted">Pruébate esta pieza en vivo sobre ti, gratis y al instante.</p>
      </div>
    );
  }

  return (
    <section className="tryon-section">
      <div className="tryon-head">
        <p className="hero-kicker">Probador Boho</p>
        <h2>Pruébate {product.title.slice(0, 40)}</h2>
      </div>

      <ARTryOn product={product} />

      <div className="tryon-stylist">
        <h3>La estilista te propone combinarlo con</h3>
        {loadingSug && <p className="muted">Buscando combinaciones…</p>}
        {suggestions && suggestions.length > 0 && (
          <ul className="tryon-suggestions">
            {suggestions.map((s) => (
              <li key={s.id} className="tryon-suggestion">
                <a
                  href={`/go/${s.id}?src=probador`}
                  target="_blank"
                  rel="nofollow sponsored noopener"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.imageUrl} alt={s.title} loading="lazy" />
                </a>
                <div>
                  <p className="tryon-suggestion-reason">“{s.reason}”</p>
                  <p className="tryon-suggestion-title">{s.title}</p>
                  <p className="price">{formatPrice(s.price, s.currency)}</p>
                  <a
                    className="buy-link"
                    href={`/go/${s.id}?src=probador`}
                    target="_blank"
                    rel="nofollow sponsored noopener"
                  >
                    Ver la pieza
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
        {suggestions && suggestions.length === 0 && !loadingSug && (
          <p className="muted">Explora la tienda para completar tu look.</p>
        )}
      </div>
    </section>
  );
}
