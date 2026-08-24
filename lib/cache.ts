import { Redis } from "@upstash/redis";
import { revalidatePath } from "next/cache";

/**
 * Caché en dos niveles.
 *
 * 1. MEMORIA del proceso: sobrevive mientras la función serverless siga
 *    caliente. No necesita configuración, así que es la única que funciona
 *    hoy en producción — donde Upstash NO está configurado y por tanto cada
 *    visita acaba golpeando Neon.
 * 2. UPSTASH Redis (sucesor de Vercel KV): compartida entre instancias.
 *    Si no está configurada, todas sus operaciones son no-op.
 *
 * La memoria no se puede invalidar entre instancias, así que su TTL es corto
 * a propósito: como mucho se sirve un listado 60 s obsoleto, a cambio de no
 * repetir la consulta en cada petición de una misma instancia caliente.
 */
const redis =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      })
    : null;

const VERSION_KEY = "cache:version";
const DEFAULT_TTL_SECONDS = 600;
/** Techo del nivel en memoria: acota cuánto puede quedarse obsoleto. */
const MEMORY_TTL_SECONDS = 60;
/** Tope de entradas para no hinchar la RAM de la función. */
const MEMORY_MAX_ENTRIES = 200;

interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}

const memory = new Map<string, MemoryEntry>();

function memoryGet<T>(key: string): T | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value as T;
}

function memorySet<T>(key: string, value: T, ttlSeconds: number): void {
  // Map conserva el orden de inserción: la primera clave es la más antigua.
  if (memory.size >= MEMORY_MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

async function currentVersion(): Promise<number> {
  if (!redis) return 0;
  return (await redis.get<number>(VERSION_KEY)) ?? 0;
}

/**
 * Invalida la caché de listados y las páginas regeneradas (ISR).
 *
 * Las fichas, la revista, el sitemap y el feed se sirven cacheados una hora;
 * sin esto, una edición del panel tardaría hasta 60 min en verse. Se invalida
 * desde la raíz con alcance "layout" porque un cambio de catálogo afecta a
 * varias plantillas a la vez. El panel no se ve afectado: sus páginas siguen
 * siendo force-dynamic.
 */
export async function bumpCacheVersion(): Promise<void> {
  memory.clear();

  try {
    // Fuera de un contexto de petición (por ejemplo desde un script suelto)
    // esta llamada lanza; la caché nunca debe tumbar una mutación.
    revalidatePath("/", "layout");
  } catch {
    // Sin contexto de petición no hay nada que invalidar.
  }

  if (!redis) return;
  try {
    await redis.incr(VERSION_KEY);
  } catch {
    // La caché nunca debe tumbar una mutación.
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const local = memoryGet<T>(key);
  if (local !== null) return local;

  if (!redis) return null;
  try {
    const v = await currentVersion();
    const value = await redis.get<T>(`v${v}:${key}`);
    if (value !== null && value !== undefined) {
      memorySet(key, value, MEMORY_TTL_SECONDS);
    }
    return value;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  memorySet(key, value, Math.min(ttlSeconds, MEMORY_TTL_SECONDS));

  if (!redis) return;
  try {
    const v = await currentVersion();
    await redis.set(`v${v}:${key}`, value, { ex: ttlSeconds });
  } catch {
    // Ignorar errores de caché.
  }
}

/**
 * Rate limit por clave (ventana fija).
 *
 * OJO: sin Redis configurado NO limita nada (devuelve siempre permitido). La
 * memoria del proceso no sirve aquí: cada instancia serverless tendría su
 * propio contador, así que el límite real sería el declarado multiplicado por
 * el número de instancias. Un límite que no limita es peor que ninguno porque
 * da falsa sensación de protección, así que se mantiene el no-op explícito.
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

/** True si hay caché compartida configurada. Para diagnóstico en el panel. */
export const hasSharedCache = redis !== null;
