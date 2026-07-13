import Link from "next/link";
import { FEED_PATH, FEED_URL, getFeedEntries, getFeedStats } from "@/lib/feed";
import { FeedPanel } from "./feed-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feed de productos — Boho Chic" };

export default async function AdminFeedPage() {
  const [stats, entries] = await Promise.all([getFeedStats(), getFeedEntries()]);
  // Los que Google rechazaría, para poder arreglarlos de uno en uno.
  const broken = entries
    .filter((e) => !e.eligible)
    .slice(0, 20)
    .map((e) => ({
      id: e.product.id,
      title: e.product.seoTitle ?? e.product.title,
      errors: e.issues.filter((i) => i.level === "error").map((i) => i.message),
    }));

  return (
    <>
      <h1>Feed de productos</h1>
      <p className="muted feed-intro">
        Archivo XML con tu catálogo, en el formato de Google Merchant Center.
        Lo aceptan también los catálogos de Meta (Facebook e Instagram) y de
        Pinterest.
      </p>

      <div className="admin-card feed-warn">
        <h2>⚠ Antes de subirlo a Google, léelo</h2>
        <p>
          Google <strong>no permite enlaces de afiliado</strong> en Shopping ads
          ni en las fichas gratuitas: exige que la compra se cierre en tu propia
          web. En esta tienda el botón de comprar sale a un tercero, así que
          subir este feed a Merchant Center por la vía normal expone la cuenta a{" "}
          <strong>desaprobación o suspensión</strong>.
        </p>
        <p>
          La excepción oficial es participar como{" "}
          <a
            href="https://comparisonshoppingpartners.withgoogle.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Comparison Shopping Service (CSS)
          </a>
          , y España está en el programa. Mientras tanto, este mismo archivo te
          sirve tal cual para el{" "}
          <strong>catálogo de Meta</strong> y el de <strong>Pinterest</strong>,
          que sí admiten afiliación.
        </p>
      </div>

      <FeedPanel
        feedPath={FEED_PATH}
        feedUrl={FEED_URL}
        initialStats={stats}
        broken={broken}
      />

      <div className="admin-card">
        <h2>Cómo se usa</h2>
        <ol className="feed-steps">
          <li>
            Copia la URL del feed y pégala en la plataforma (Merchant Center:
            <em> Productos → Fuentes de datos → Añadir feed programado</em>).
          </li>
          <li>
            La plataforma lo descarga sola, a diario. <strong>No hay nada que
            regenerar</strong> cuando añades productos: el archivo se construye
            en cada descarga leyendo el catálogo, así que siempre va al día.
          </li>
          <li>
            El botón de arriba sirve para <strong>comprobarlo ahora</strong>: lo
            genera de verdad, valida cada producto y te dice qué falta. Úsalo
            después de una carga grande.
          </li>
        </ol>
        <p className="muted">
          Cada producto enlaza a su ficha de bohochic.es (nunca al enlace de
          afiliado, que Google prohíbe en el feed). Los productos desactivados
          no salen; y puedes dejar fuera uno concreto sin ocultarlo de la tienda
          con la casilla «Fuera del feed» de su{" "}
          <Link href="/admin/products">ficha</Link>.
        </p>
      </div>
    </>
  );
}
