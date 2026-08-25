/**
 * Catálogo de modelos gratuitos de OpenRouter.
 *
 * Se consulta en vivo su API de modelos, que es PÚBLICA (no hace falta clave),
 * en vez de mantener una lista escrita a mano. El catálogo gratuito rota
 * constantemente: los modelos entran y salen, y uno retirado devuelve 404. Una
 * lista fija en el código envejece en semanas.
 */

const MODELS_URL = "https://openrouter.ai/api/v1/models";

export interface FreeModel {
  id: string;
  name: string;
  /** Ventana de contexto en tokens. */
  contextLength: number;
  /** El asistente necesita `tools`; el redactor de fichas, no. */
  supportsTools: boolean;
}

interface ApiModel {
  id: string;
  name?: string;
  context_length?: number;
  supported_parameters?: string[];
}

let cache: { models: FreeModel[]; expiresAt: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

/**
 * Modelos gratuitos disponibles ahora mismo, de mayor a menor contexto.
 *
 * Cachea diez minutos: el catálogo no cambia por minutos y el panel puede
 * recargarse varias veces seguidas mientras se elige.
 */
export async function listFreeModels(): Promise<FreeModel[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.models;

  const response = await fetch(MODELS_URL, {
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`OpenRouter: HTTP ${response.status} al listar modelos`);
  }

  const data = (await response.json()) as { data?: ApiModel[] };
  const models = (data.data ?? [])
    .filter((m) => m.id.endsWith(":free"))
    .map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      contextLength: m.context_length ?? 0,
      supportsTools: (m.supported_parameters ?? []).includes("tools"),
    }))
    .sort((a, b) => b.contextLength - a.contextLength);

  cache = { models, expiresAt: Date.now() + TTL_MS };
  return models;
}

/** True si ese id sigue en el catálogo gratuito. */
export async function isFreeModelAvailable(id: string): Promise<boolean> {
  try {
    return (await listFreeModels()).some((m) => m.id === id);
  } catch {
    // Si el catálogo no responde no se puede afirmar que NO exista: se deja
    // pasar y que falle la llamada real, que da mejor diagnóstico.
    return true;
  }
}
