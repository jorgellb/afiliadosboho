import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL, PROCESSORS } from "@/lib/legal";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: `Política de privacidad | ${SITE_NAME}`,
  description:
    "Qué datos tratamos en Boho Chic, para qué, durante cuánto tiempo y cómo ejercer tus derechos. Sin analítica ni perfilado.",
  alternates: { canonical: `${SITE_URL}/privacidad` },
};

export default function PrivacyPage() {
  return (
    <article className="legal">
      <p className="legal-kicker">Última actualización: {LEGAL.updated}</p>
      <h1>Política de privacidad</h1>
      <p className="legal-lead">
        Esta web trata los mínimos datos posibles. No usamos analítica, ni
        publicidad, ni perfilado, ni vendemos datos a nadie. Aquí está el
        detalle, sin letra pequeña.
      </p>

      <h2>1. Quién es el responsable</h2>
      <ul className="legal-facts">
        <li>
          <span>Responsable</span>
          <span>{LEGAL.owner}</span>
        </li>
        <li>
          <span>Nombre comercial</span>
          <span>{LEGAL.tradeName}</span>
        </li>
        <li>
          <span>NIF</span>
          <span>{LEGAL.nif}</span>
        </li>
        <li>
          <span>Domicilio</span>
          <span>{LEGAL.address}</span>
        </li>
        <li>
          <span>Contacto</span>
          <span>
            <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
          </span>
        </li>
        <li>
          <span>Sitio web</span>
          <span>{LEGAL.site}</span>
        </li>
      </ul>

      <h2>2. Qué datos tratamos y por qué</h2>

      <h3>Suscripción desde el test de estilo</h3>
      <p>
        Si al terminar <Link href="/quiz">el test</Link> nos dejas tu correo,
        guardamos <strong>ese correo y el perfil de estilo</strong> que ha
        salido. La finalidad es enviarte tu selección y las novedades que
        encajen con tu estilo. La base legal es{" "}
        <strong>tu consentimiento</strong>, que puedes retirar cuando quieras
        escribiéndonos. Conservamos el dato hasta que pidas la baja.
      </p>

      <h3>Buscador por imagen («Encuentra este look»)</h3>
      <p>
        La fotografía que subes se envía a nuestro proveedor de inteligencia
        artificial para que describa las prendas, y{" "}
        <strong>se descarta al terminar</strong>: no la guardamos en ningún
        servidor ni base de datos, y no queda ninguna copia. Lo único que
        conservamos, durante <strong>48 horas</strong>, es un identificador de
        sesión anónimo, las prendas detectadas y los productos que te
        propusimos, para limitar el abuso del servicio y corregir errores.
        Después se borra automáticamente.
      </p>
      <p className="legal-warn">
        No subas fotografías con datos personales de terceros, documentos ni
        información sensible.
      </p>

      <h3>La estilista virtual (chat)</h3>
      <p>
        Los mensajes que escribes se envían a nuestro proveedor de inteligencia
        artificial para poder responderte.{" "}
        <strong>No los guardamos en ninguna base de datos</strong>: la
        conversación vive en tu navegador y desaparece cuando cierras la
        pestaña. No escribas en el chat datos personales ni información
        sensible.
      </p>

      <h3>El probador virtual (cámara)</h3>
      <p>
        Cuando pruebas una pieza con la cámara, el vídeo se procesa{" "}
        <strong>íntegramente en tu dispositivo</strong>. Ni las imágenes ni el
        vídeo salen de él: no se envían a nuestros servidores ni a terceros, y
        no se guarda nada.
      </p>

      <h3>Navegación y seguridad</h3>
      <p>
        Nuestro proveedor de alojamiento registra datos técnicos de las
        peticiones (dirección IP, fecha y hora, navegador) en los registros del
        servidor, como cualquier servidor web. La base legal es nuestro{" "}
        <strong>interés legítimo</strong> en mantener el servicio seguro y
        operativo.
      </p>

      <h3>Estadísticas de clics</h3>
      <p>
        Cuando pulsas en una pieza guardamos <em>qué</em> producto era y{" "}
        <em>desde qué sección</em> lo pulsaste. No guardamos tu dirección IP ni
        ningún identificador que permita relacionarlo contigo:{" "}
        <strong>no son datos personales</strong>.
      </p>

      <h2>3. Enlaces de afiliado</h2>
      <p>
        Cuando pulsas «Comprar esta pieza» te llevamos a la web de nuestro socio
        comercial. A partir de ese momento se aplican{" "}
        <strong>su política de privacidad y sus cookies</strong>, sobre las que
        no tenemos control. Si compras a través de esos enlaces podemos recibir
        una comisión, sin coste adicional para ti. No les cedemos ningún dato
        personal tuyo.
      </p>

      <h2>4. Quién más trata tus datos</h2>
      <p>
        Solo los proveedores necesarios para que la web funcione, como
        encargados del tratamiento:
      </p>
      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Para qué</th>
              <th>Ubicación</th>
            </tr>
          </thead>
          <tbody>
            {PROCESSORS.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>{p.role}</td>
                <td>{p.country}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Algunos están radicados en Estados Unidos. Esas transferencias
        internacionales se amparan en las cláusulas contractuales tipo aprobadas
        por la Comisión Europea y, cuando procede, en el Marco de Privacidad de
        Datos UE-EE. UU.
      </p>

      <h2>5. Cuánto tiempo conservamos cada cosa</h2>
      <div className="legal-table-wrap">
        <table className="legal-table">
          <thead>
            <tr>
              <th>Dato</th>
              <th>Plazo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Correo y perfil de estilo</td>
              <td>Hasta que pidas la baja</td>
            </tr>
            <tr>
              <td>Fotografías del buscador por imagen</td>
              <td>No se almacenan</td>
            </tr>
            <tr>
              <td>Resultados de una búsqueda por imagen</td>
              <td>48 horas</td>
            </tr>
            <tr>
              <td>Conversaciones con la estilista</td>
              <td>No se almacenan</td>
            </tr>
            <tr>
              <td>Registros del servidor</td>
              <td>Según la política de nuestro proveedor de alojamiento</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>6. Tus derechos</h2>
      <p>
        Puedes ejercer los derechos de <strong>acceso</strong>,{" "}
        <strong>rectificación</strong>, <strong>supresión</strong>,{" "}
        <strong>oposición</strong>, <strong>limitación</strong> y{" "}
        <strong>portabilidad</strong>, y retirar tu consentimiento en cualquier
        momento, escribiendo a{" "}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> o por correo postal
        a {LEGAL.address}. Te responderemos en el plazo de un mes.
      </p>
      <p>
        Si consideras que no hemos atendido bien tu solicitud, puedes reclamar
        ante la Agencia Española de Protección de Datos (
        <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">
          www.aepd.es
        </a>
        ).
      </p>

      <h2>7. Menores</h2>
      <p>
        Esta web no está dirigida a menores de 14 años y no recogemos datos de
        forma consciente de personas de esa edad.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas razonables: conexión cifrada (HTTPS), acceso
        al panel de administración protegido con contraseña y cookie de sesión
        firmada, y borrado automático de los datos temporales.
      </p>

      <h2>9. Cambios en esta política</h2>
      <p>
        Si cambiamos algo relevante, actualizaremos esta página y la fecha del
        encabezado, y si afecta a las cookies volveremos a pedirte tu decisión.
      </p>

      <p className="legal-foot">
        Ver también la <Link href="/cookies">política de cookies</Link>.
      </p>
    </article>
  );
}
