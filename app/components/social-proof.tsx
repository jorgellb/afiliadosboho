/**
 * Prueba social real de AliExpress. Se muestra solo lo que existe: el
 * descuento es universal; valoración y ventas aparecen únicamente si el
 * proveedor las aportó (nunca se inventan ni se muestran ceros).
 */

interface SocialFields {
  rating: string | null; // % valoraciones positivas
  ordersCount: number | null;
  discountPct: number | null;
}

function formatOrders(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

/** Sello de descuento para superponer sobre la imagen. */
export function DiscountBadge({ discountPct }: { discountPct: number | null }) {
  if (!discountPct || discountPct < 5) return null;
  return <span className="discount-badge">−{discountPct}%</span>;
}

/** Fila de valoración + ventas bajo el título. */
export function SocialRow({ rating, ordersCount }: SocialFields) {
  const hasRating = rating !== null && Number(rating) > 0;
  const hasOrders = ordersCount !== null && ordersCount > 0;
  if (!hasRating && !hasOrders) return null;
  return (
    <p className="social-row">
      {hasRating && (
        <span className="social-rating">★ {Math.round(Number(rating))}%</span>
      )}
      {hasOrders && (
        <span className="social-orders">{formatOrders(ordersCount!)} vendidos</span>
      )}
    </p>
  );
}
