import { Pool } from "pg";

/**
 * Pool de conexiones Postgres estándar.
 *
 * Sustituye a `@neondatabase/serverless`, que hablaba HTTP contra el proxy de
 * Neon y no sirve para ningún otro proveedor.
 *
 * SOBRE EL TAMAÑO DEL POOL: `max: 1`, y es deliberado. El driver HTTP de Neon
 * no abría conexiones persistentes; uno TCP sí. En Vercel cada invocación
 * concurrente es su propia instancia, así que un pool de 10 por instancia
 * agota el límite de conexiones del servidor en cuanto hay algo de tráfico.
 * Con 1 por instancia, el número de conexiones equivale al de instancias
 * calientes. Si aun así se llega al límite del plan, la solución no es subir
 * este número sino usar el pooler (PgBouncer) del proveedor.
 */

let pool: Pool | undefined;

/**
 * Certificado de la CA del proveedor, en PEM.
 *
 * Sin él no se puede verificar la cadena TLS de proveedores que usan su
 * propia CA (Aiven es uno), y la conexión cae a modo sin verificar: cifra,
 * pero no protege de un intermediario. Neon usa una CA pública y no lo
 * necesita. Se acepta el PEM tal cual o con los saltos de línea escapados
 * como \n, que es como se suele pegar en un panel de variables de entorno.
 */
function sslConfig() {
  const ca = process.env.DATABASE_CA_CERT?.trim();
  if (ca) {
    return { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true };
  }
  // Sin CA declarada: se cifra igualmente, pero no se verifica el certificado.
  return { rejectUnauthorized: false };
}

/**
 * Quita `sslmode` de la cadena de conexión.
 *
 * NO es cosmético: `pg` interpreta `sslmode=require` como `verify-full`, y ese
 * valor PISA el objeto `ssl` que se pasa aparte. Con la URL de Aiven tal cual
 * la conexión muere con "self-signed certificate in certificate chain" aunque
 * se haya configurado `rejectUnauthorized: false`. Quitándolo, manda `ssl`.
 */
function withoutSslMode(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    return url;
  }
}

export function getPool(): Pool {
  if (pool) return pool;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definida");

  pool = new Pool({
    connectionString: withoutSslMode(url),
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: sslConfig(),
  });

  // Un error en una conexión ociosa no debe tumbar el proceso.
  pool.on("error", (error) => {
    console.error("[db] error en conexión ociosa:", error.message);
  });

  return pool;
}

/**
 * Consulta con template literal etiquetado, con la misma forma que tenía el
 * driver de Neon: devuelve las filas directamente, no el objeto resultado.
 *
 *   const rows = await sql`SELECT * FROM products WHERE id = ${id}`;
 *
 * Las interpolaciones se convierten en parámetros posicionales ($1, $2…), así
 * que siguen yendo parametrizadas: no se concatena nada en el SQL.
 */
export async function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const text = strings.reduce(
    (acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ""),
    ""
  );
  const result = await getPool().query(text, values);
  return result.rows as T[];
}

/** Consulta con SQL ya montado. Para sentencias sin parámetros. */
export async function sqlRaw<T = Record<string, unknown>>(
  text: string
): Promise<T[]> {
  const result = await getPool().query(text);
  return result.rows as T[];
}
