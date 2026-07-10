import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { CookieSettingsLink } from "../components/cookie-banner";

export const metadata: Metadata = {
  title: `Política de cookies | ${SITE_NAME}`,
  description:
    "Boho Chic solo usa tres cookies técnicas. Sin analítica, sin publicidad y sin perfilado. Aquí puedes ver cuáles son y cambiar tu decisión.",
  alternates: { canonical: `${SITE_URL}/cookies` },
};

const COOKIES = [
  {
    name: "bc_consent",
    purpose: "Recuerda qué has elegido en el aviso de cookies para no volver a preguntártelo.",
    duration: "12 meses",
  },
  {
    name: "look_session",
    purpose:
      "Identificador anónimo que solo se crea si usas «Encuentra este look». Sirve para limitar cuántas búsquedas se hacen y evitar abusos. No contiene datos tuyos.",
    duration: "30 días",
  },
  {
    name: "admin_session",
    purpose:
      "Mantiene la sesión iniciada en el panel de administración. Solo se crea si te identificas como administrador de la tienda.",
    duration: "7 días",
  },
];

export default function CookiesPage() {
  return (
    <article className="legal">
      <p className="legal-kicker">Última actualización: {LEGAL.updated}</p>
      <h1>Política de cookies</h1>
      <p className="legal-lead">
        Esta web usa <strong>tres cookies, todas técnicas</strong>. No hay
        analítica, ni publicidad, ni perfilado, ni scripts de terceros
        cargándose por detrás.
      </p>

      <h2>1. Qué es una cookie</h2>
      <p>
        Una cookie es un archivo pequeño que una web guarda en tu navegador para
        recordar algo entre una página y la siguiente: que has iniciado sesión,
        qué elegiste en un aviso, o cuántas veces has usado una función.
      </p>

      <h2>2. Las cookies que usamos</h2>
      <p>
        Las tres son <strong>propias</strong> (las pone bohochic.es, no un
        tercero) y <strong>técnicas o necesarias</strong>: sin ellas la web no
        puede funcionar o no puede protegerse de abusos. Por eso no requieren
        consentimiento.
      </p>
      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead>
            <tr>
              <th>Cookie</th>
              <th>Para qué sirve</th>
              <th>Duración</th>
            </tr>
          </thead>
          <tbody>
            {COOKIES.map((c) => (
              <tr key={c.name}>
                <td>
                  <code>{c.name}</code>
                </td>
                <td>{c.purpose}</td>
                <td>{c.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>3. Lo que no usamos</h2>
      <p>
        A día de hoy <strong>no instalamos ninguna cookie</strong> de medición,
        estadística, publicidad, redes sociales ni perfilado, y no cargamos
        etiquetas de terceros (ni Google Analytics, ni píxeles publicitarios).
        Por eso las dos categorías opcionales del panel aparecen vacías: existen
        para que, si algún día incorporamos alguna,{" "}
        <strong>solo se instale si tú la activas</strong>.
      </p>

      <h2>4. Cookies de terceros al salir de la web</h2>
      <p>
        Cuando pulsas «Comprar esta pieza» te llevamos a la tienda de nuestro
        socio comercial. Esa web es de un tercero y{" "}
        <strong>instalará sus propias cookies</strong> según su propia política,
        sobre la que no tenemos control. Esas cookies se colocan en su dominio,
        no en bohochic.es.
      </p>

      <h2>5. Cómo cambiar tu decisión</h2>
      <p>
        Puedes revisar o retirar tu consentimiento cuando quieras desde aquí:
      </p>
      <p>
        <CookieSettingsLink />
      </p>
      <p>
        También puedes borrar o bloquear las cookies desde tu navegador. Ten en
        cuenta que si bloqueas las técnicas, el panel de administración y el
        límite del buscador por imagen pueden dejar de funcionar como esperas.
      </p>

      <h2>6. Qué pasa si rechazas</h2>
      <p>
        Nada: la tienda funciona exactamente igual. No hay ningún contenido ni
        función detrás de un muro de cookies. Rechazar cuesta un solo clic, los
        mismos que aceptar.
      </p>

      <h2>7. Cambios</h2>
      <p>
        Si añadimos, quitamos o cambiamos la finalidad de alguna cookie,
        actualizaremos esta página y volveremos a pedirte tu decisión.
      </p>

      <p className="legal-foot">
        Ver también la <Link href="/privacidad">política de privacidad</Link>.
      </p>
    </article>
  );
}
