-- Ajustes editables desde el panel, sin redesplegar.
--
-- Nace para poder elegir el modelo de IA que redacta las fichas SEO: el
-- catálogo gratuito de OpenRouter rota constantemente, y tener que tocar una
-- variable de entorno y volver a desplegar cada vez que un modelo se retira o
-- aparece otro mejor no es manejable.
--
-- Clave-valor a propósito: lo que hoy es el modelo mañana será otra cosa, y
-- una tabla por ajuste sería absurda para un puñado de valores.
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
