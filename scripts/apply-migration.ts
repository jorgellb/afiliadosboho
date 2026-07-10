/**
 * Aplica un archivo .sql contra la base de datos.
 *
 *   npx tsx scripts/apply-migration.ts drizzle/0005_article_hero_alt.sql
 *
 * Se usa en lugar de `drizzle-kit push` porque push compara el esquema con la
 * base real y propondría borrar las tablas creadas por SQL crudo (las de
 * pgvector: product_embeddings, look_searches, embed_progress), que no están
 * declaradas en schema.ts.
 *
 * Ejecuta las sentencias de una en una: el driver HTTP de Neon no admite
 * varias en la misma llamada.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("uso: npx tsx scripts/apply-migration.ts <archivo.sql>");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("falta DATABASE_URL");

  const sql = neon(url);
  const statements = readFileSync(file, "utf8")
    .split(";")
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);

  for (const statement of statements) {
    console.log(`> ${statement.replace(/\s+/g, " ").slice(0, 90)}`);
    await sql.query(statement);
  }
  console.log(`\n${statements.length} sentencia(s) aplicadas desde ${file}`);
}

main().then(() => process.exit(0));
