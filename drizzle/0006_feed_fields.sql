-- Atributos que Google Merchant Center exige y que la API de AliExpress no da.
-- Se aplica con: npx tsx scripts/apply-migration.ts drizzle/0006_feed_fields.sql
-- (a mano, no con drizzle-kit push: push borraría las tablas de pgvector
--  creadas por SQL crudo en 0004).
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gtin text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS size text;
-- Permite dejar fuera del feed un producto concreto sin desactivarlo en la tienda.
ALTER TABLE products ADD COLUMN IF NOT EXISTS feed_excluded boolean NOT NULL DEFAULT false;
