/**
 * Migra la base de datos completa de un Postgres a otro.
 *
 *   TARGET_DATABASE_URL="postgres://..." npx tsx scripts/migrate-db.ts
 *
 * Origen: DATABASE_URL. Destino: TARGET_DATABASE_URL.
 *
 * Hace tres cosas, en este orden:
 *   1. Extensiones (vector, pg_trgm) — antes que nada, porque el esquema las usa.
 *   2. Esquema, aplicando drizzle/*.sql en orden. NO se usa `drizzle-kit
 *      migrate`: su journal solo registra hasta 0003, mientras que 0004, 0005 y
 *      0006 se aplicaron en crudo. Un migrate dejaría la base a medias.
 *   3. Datos, tabla por tabla, respetando el orden de dependencias.
 *
 * Es idempotente en el esquema (todo lleva IF NOT EXISTS o se tolera el fallo
 * de "ya existe") y REEMPLAZA los datos de las tablas que copia.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

/** `pg` interpreta sslmode=require como verify-full y eso pisa el objeto ssl. */
function clean(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete("sslmode");
  return parsed.toString();
}

function client(url: string) {
  return new pg.Client({
    connectionString: clean(url),
    ssl: { rejectUnauthorized: false },
    // Copiar tablas grandes de una vez puede tardar.
    statement_timeout: 120_000,
  });
}

/** Orden de copia: las referenciadas primero. */
const TABLE_ORDER = [
  "products",
  "articles",
  "subscribers",
  "click_events",
  "product_embeddings",
  "look_searches",
  "embed_progress",
  "product_tryon_assets",
  "tryon_jobs",
  "stylist_suggestions",
  "shared_looks",
];

async function main() {
  const sourceUrl = process.env.DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;
  if (!sourceUrl) throw new Error("falta DATABASE_URL (origen)");
  if (!targetUrl) throw new Error("falta TARGET_DATABASE_URL (destino)");
  if (clean(sourceUrl) === clean(targetUrl)) {
    throw new Error("origen y destino son la misma base; abortando");
  }

  const source = client(sourceUrl);
  const target = client(targetUrl);
  await source.connect();
  await target.connect();

  const srcHost = new URL(sourceUrl).host;
  const dstHost = new URL(targetUrl).host;
  console.log(`Origen : ${srcHost}`);
  console.log(`Destino: ${dstHost}\n`);

  // --- 1. Extensiones -----------------------------------------------------
  console.log("== Extensiones ==");
  for (const ext of ["vector", "pg_trgm"]) {
    await target.query(`CREATE EXTENSION IF NOT EXISTS ${ext}`);
    const r = await target.query(
      "select extversion from pg_extension where extname = $1",
      [ext]
    );
    console.log(`  ${ext.padEnd(10)} ${r.rows[0]?.extversion ?? "NO INSTALADA"}`);
  }

  // --- 2. Esquema ---------------------------------------------------------
  console.log("\n== Esquema ==");
  const dir = join(process.cwd(), "drizzle");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    // Los ficheros de drizzle separan con su propio marcador; los escritos a
    // mano, con punto y coma. Ninguno usa dollar-quoting, así que es seguro.
    const statements = (
      sql.includes("--> statement-breakpoint")
        ? sql.split("--> statement-breakpoint")
        : sql.split(";")
    )
      .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
      .filter(Boolean);

    let ok = 0;
    let skipped = 0;
    for (const statement of statements) {
      try {
        await target.query(statement);
        ok++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // "ya existe" es esperable al repetir la migración.
        if (/already exists|ya existe|duplicate/i.test(message)) skipped++;
        else {
          console.error(`  ! ${file}: ${message}`);
          console.error(`    en: ${statement.replace(/\s+/g, " ").slice(0, 110)}`);
        }
      }
    }
    console.log(`  ${file.padEnd(32)} ${ok} aplicadas, ${skipped} ya existían`);
  }

  // --- 3. Datos -----------------------------------------------------------
  console.log("\n== Datos ==");
  const existing = await target.query(
    "select tablename from pg_tables where schemaname='public'"
  );
  const inTarget = new Set(existing.rows.map((r) => r.tablename));

  // Tipos de columna del destino, para saber cuáles hay que serializar.
  //
  // Es imprescindible: `pg` devuelve un jsonb que contiene un array como array
  // de JavaScript, y al reinsertarlo lo serializa como ARRAY de Postgres
  // ({"a","b"}) en vez de como JSON (["a","b"]). El INSERT muere con "invalid
  // input syntax for type json". Un jsonb con objeto dentro no da problema,
  // porque ahí sí acaba en JSON.stringify. Los arrays REALES (_text, _uuid)
  // deben quedarse como arrays, así que la distinción importa.
  const typeRows = await target.query(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns WHERE table_schema = 'public'`
  );
  const jsonColumns = new Map<string, Set<string>>();
  for (const row of typeRows.rows) {
    if (row.data_type === "json" || row.data_type === "jsonb") {
      if (!jsonColumns.has(row.table_name)) jsonColumns.set(row.table_name, new Set());
      jsonColumns.get(row.table_name)!.add(row.column_name);
    }
  }

  for (const table of TABLE_ORDER) {
    if (!inTarget.has(table)) {
      console.log(`  ${table.padEnd(24)} NO existe en destino; se salta`);
      continue;
    }
    const jsonCols = jsonColumns.get(table) ?? new Set<string>();
    const rows = (await source.query(`SELECT * FROM "${table}"`)).rows;
    if (rows.length === 0) {
      console.log(`  ${table.padEnd(24)} 0 filas`);
      continue;
    }

    // Se vacía antes de copiar para que repetir la migración no duplique.
    await target.query(`TRUNCATE TABLE "${table}" CASCADE`);

    const columns = Object.keys(rows[0]);
    const quoted = columns.map((c) => `"${c}"`).join(", ");
    // Lotes: un INSERT gigante revienta el límite de parámetros (65535).
    const perBatch = Math.max(1, Math.floor(60000 / columns.length));

    let done = 0;
    for (let i = 0; i < rows.length; i += perBatch) {
      const batch = rows.slice(i, i + perBatch);
      const values: unknown[] = [];
      const tuples = batch.map((row, r) => {
        const placeholders = columns.map((col, c) => {
          const value = row[col];
          values.push(
            jsonCols.has(col) && value !== null && value !== undefined
              ? JSON.stringify(value)
              : value
          );
          return `$${r * columns.length + c + 1}`;
        });
        return `(${placeholders.join(", ")})`;
      });
      await target.query(
        `INSERT INTO "${table}" (${quoted}) VALUES ${tuples.join(", ")}`,
        values
      );
      done += batch.length;
    }
    console.log(`  ${table.padEnd(24)} ${done} filas copiadas`);
  }

  // --- 4. Secuencias ------------------------------------------------------
  // Las columnas bigserial llevan su propia secuencia; tras un INSERT con id
  // explícito se queda atrás y el siguiente alta chocaría con clave duplicada.
  console.log("\n== Secuencias ==");
  const seqs = await target.query(`
    SELECT c.relname AS seq, t.relname AS tbl, a.attname AS col
    FROM pg_class c
    JOIN pg_depend d ON d.objid = c.oid AND d.deptype = 'a'
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    WHERE c.relkind = 'S'
  `);
  for (const { seq, tbl, col } of seqs.rows) {
    const max = await target.query(
      `SELECT COALESCE(MAX("${col}"), 0)::bigint AS m FROM "${tbl}"`
    );
    await target.query(`SELECT setval($1, $2, true)`, [
      seq,
      String(Math.max(1, Number(max.rows[0].m))),
    ]);
    console.log(`  ${seq.padEnd(36)} -> ${max.rows[0].m}`);
  }

  // --- 5. Verificación ----------------------------------------------------
  console.log("\n== Verificación ==");
  let mismatch = 0;
  for (const table of TABLE_ORDER) {
    if (!inTarget.has(table)) continue;
    const a = (await source.query(`SELECT count(*)::int n FROM "${table}"`)).rows[0].n;
    const b = (await target.query(`SELECT count(*)::int n FROM "${table}"`)).rows[0].n;
    const mark = a === b ? "OK " : "!! ";
    if (a !== b) mismatch++;
    console.log(`  ${mark}${table.padEnd(24)} origen ${String(a).padStart(5)} | destino ${String(b).padStart(5)}`);
  }

  await source.end();
  await target.end();

  console.log(
    mismatch === 0
      ? "\n✓ Migración completa: todas las tablas cuadran."
      : `\n✗ ${mismatch} tabla(s) NO cuadran. Revisa los errores.`
  );
  process.exit(mismatch === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
