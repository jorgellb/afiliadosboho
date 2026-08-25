import { sql as raw } from "@/lib/db/pool";

/**
 * Ajustes editables desde el panel, guardados en la tabla `settings`.
 *
 * Existe para lo que una variable de entorno hace mal: cambiar sin
 * redesplegar. El catálogo gratuito de OpenRouter rota —los modelos entran y
 * salen, y uno retirado devuelve 404—, así que el modelo que redacta las
 * fichas tiene que poder cambiarse desde la interfaz en treinta segundos.
 *
 * Se cachea en memoria del proceso: esto se consulta en cada llamada a la IA,
 * y una ida a la base de datos por consulta sería un peaje absurdo para leer
 * una cadena de texto. El TTL es corto para que un cambio desde el panel se
 * note enseguida aunque haya varias instancias servidoras.
 */

const TTL_MS = 30_000;

interface Cached {
  value: string | null;
  expiresAt: number;
}

const cache = new Map<string, Cached>();

/** Claves reconocidas. Tenerlas tipadas evita erratas silenciosas. */
export const SETTING_SEO_MODEL = "seo_model";

export async function getSetting(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  try {
    const rows = await raw<{ value: string }>`
      SELECT value FROM settings WHERE key = ${key}
    `;
    const value = rows[0]?.value ?? null;
    cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  } catch {
    // Si la tabla aún no existe o la base falla, el ajuste simplemente no está
    // definido: quien llama debe tener un valor por defecto. Un ajuste no
    // puede tumbar la generación de fichas.
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await raw`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${key}, ${value}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

/** Borra un ajuste y vuelve al valor por defecto del código. */
export async function clearSetting(key: string): Promise<void> {
  await raw`DELETE FROM settings WHERE key = ${key}`;
  cache.delete(key);
}
