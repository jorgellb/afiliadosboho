-- Texto alternativo de la imagen destacada de cada artículo.
-- Se aplica con: npx tsx scripts/apply-migration.ts drizzle/0005_article_hero_alt.sql
-- (a mano, no con drizzle-kit push: push compara contra la base real y borraría
--  las tablas creadas por SQL crudo en 0004: product_embeddings, look_searches…)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS hero_image_alt text;
