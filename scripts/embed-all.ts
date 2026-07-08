/**
 * Indexación masiva del catálogo desde tu ordenador (coste cero).
 *
 *   npx tsx scripts/embed-all.ts            # contra producción
 *   TARGET=http://localhost:3100 npx tsx scripts/embed-all.ts
 *
 * Llama al endpoint /api/catalog/embed-batch en bucle con pausas de 60s para
 * respetar el rate limit gratuito de NIM (~40 req/min). Es reanudable: si lo
 * cortas y lo relanzas, continúa donde iba (el lote salta lo ya indexado).
 *
 * Requiere en el entorno: INTERNAL_API_KEY (la misma que en Vercel) y TARGET
 * (URL base del sitio; por defecto la de producción de .env o localhost).
 */
import "dotenv/config";

const TARGET =
  process.env.TARGET ||
  process.env.SITE_URL ||
  "https://afiliados-nu.vercel.app";
const KEY = process.env.INTERNAL_API_KEY;
const PAUSE_MS = 60_000;

async function main() {
  if (!KEY) {
    console.error("Falta INTERNAL_API_KEY en el entorno (.env.local).");
    process.exit(1);
  }
  console.log(`Indexando catálogo en ${TARGET} …`);
  let total = 0;
  for (let round = 1; ; round++) {
    const res = await fetch(`${TARGET}/api/catalog/embed-batch`, {
      method: "POST",
      headers: { "x-api-key": KEY },
    });
    if (!res.ok) {
      console.error(`Lote ${round}: HTTP ${res.status}. Reintentando en 60s…`);
      await sleep(PAUSE_MS);
      continue;
    }
    const data = (await res.json()) as {
      processed: number;
      remaining: number;
      done: boolean;
      errors: string[];
    };
    total += data.processed;
    console.log(
      `Lote ${round}: +${data.processed} (total ${total}) · quedan ${data.remaining}` +
        (data.errors.length ? ` · errores: ${data.errors.length}` : "")
    );
    if (data.done) {
      console.log(`✓ Catálogo indexado por completo (${total} productos).`);
      return;
    }
    await sleep(PAUSE_MS);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
