import { Redis } from "@upstash/redis";

// Caché opcional: si Upstash for Redis (el sucesor de Vercel KV en el
// Marketplace) no está configurado, todas las operaciones son no-op y la app
// consulta la base de datos directamente.
const redis =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      })
    : null;

const VERSION_KEY = "cache:version";
const DEFAULT_TTL_SECONDS = 600;

async function currentVersion(): Promise<number> {
  if (!redis) return 0;
  return (await redis.get<number>(VERSION_KEY)) ?? 0;
}

/**
 * Invalida toda la caché de listados incrementando la versión global.
 * Las claves antiguas expiran solas por TTL; no hace falta enumerarlas.
 */
export async function bumpCacheVersion(): Promise<void> {
  if (!redis) return;
  try {
    await redis.incr(VERSION_KEY);
  } catch {
    // La caché nunca debe tumbar una mutación.
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const v = await currentVersion();
    return await redis.get<T>(`v${v}:${key}`);
  } catch {
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  if (!redis) return;
  try {
    const v = await currentVersion();
    await redis.set(`v${v}:${key}`, value, { ex: ttlSeconds });
  } catch {
    // Ignorar errores de caché.
  }
}

/**
 * Rate limit simple por clave (ventana fija). Sin Redis configurado no
 * limita (devuelve true = permitido).
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  if (!redis) return true;
  try {
    const k = `rl:${key}`;
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, windowSeconds);
    return n <= limit;
  } catch {
    return true;
  }
}
