-- "Encuentra este Look": búsqueda semántica por imagen (pgvector, tier gratuito).
-- Tablas fuera del esquema Drizzle: se consultan por SQL crudo (operadores <=>).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS product_embeddings (
  id bigserial PRIMARY KEY,
  product_id text UNIQUE NOT NULL,
  garment_description text NOT NULL,
  attributes jsonb NOT NULL,
  embedding vector(1024) NOT NULL,
  embedding_model text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_embeddings_hnsw
  ON product_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS product_embeddings_type_idx
  ON product_embeddings ((attributes->>'type'));

CREATE TABLE IF NOT EXISTS look_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  source_image_url text NOT NULL DEFAULT '',
  detected_items jsonb NOT NULL,
  results jsonb NOT NULL,
  clicked_products text[],
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '48 hours'
);
CREATE INDEX IF NOT EXISTS look_searches_session_idx ON look_searches (session_id);
CREATE INDEX IF NOT EXISTS look_searches_created_idx ON look_searches (created_at);

-- Cursor para la indexación por lotes reanudable (una sola fila).
CREATE TABLE IF NOT EXISTS embed_progress (
  id int PRIMARY KEY DEFAULT 1,
  last_processed_product_id text,
  updated_at timestamptz DEFAULT now()
);
INSERT INTO embed_progress (id, last_processed_product_id)
  VALUES (1, NULL) ON CONFLICT (id) DO NOTHING;
