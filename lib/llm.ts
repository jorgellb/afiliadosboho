/**
 * Capa de modelos de lenguaje, independiente del proveedor.
 *
 * OpenRouter y NVIDIA hablan el mismo dialecto (el de OpenAI), así que la
 * única diferencia real entre ellos es la URL base, la clave y el nombre del
 * modelo. Esta capa encadena ambos: se intenta OpenRouter con sus modelos
 * gratuitos y, si ninguno responde, se cae a NVIDIA. Todo lo que ya usaba
 * `callModel` —curador, fichas SEO, artículos, asistente— hereda la cadena
 * sin tocar su código.
 *
 * SOBRE LOS LÍMITES DE OPENROUTER GRATUITO: la cuenta sin crédito admite unas
 * 50 peticiones al día y ~20 por minuto. Una curación diaria de las nueve
 * categorías más las fichas SEO de lo que entre se come ese cupo enseguida,
 * así que la caída a NVIDIA no es decorativa: es lo que mantiene el sistema
 * en pie cuando OpenRouter empieza a devolver 429.
 */

export interface LlmMessage {
  role: string;
  content: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

export interface LlmOptions {
  tools?: object[];
  maxTokens?: number;
  /** Corta antes de que la plataforma mate la función sin mensaje. */
  timeoutMs?: number;
}

interface Provider {
  name: string;
  baseUrl: string;
  apiKey: string | undefined;
  models: string[];
  extraHeaders: Record<string, string>;
}

/**
 * Modelos gratuitos de OpenRouter, por orden de preferencia.
 *
 * Comprobados contra su API de modelos: los tres admiten `tools`, que el
 * asistente necesita. Se pueden cambiar sin tocar código con OPENROUTER_MODELS
 * porque los identificadores del catálogo gratuito cambian con frecuencia:
 * los modelos entran y salen de la lista, y uno retirado devuelve 404.
 */
const DEFAULT_OPENROUTER_MODELS = [
  // Comprobado: responde en ~1,6 s y devuelve JSON limpio. Es de razonamiento,
  // pero el razonamiento no se descuenta del presupuesto de contenido, así que
  // funciona incluso con max_tokens bajos.
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "google/gemma-4-31b-it:free",
];

function list(value: string | undefined, fallback: string[]): string[] {
  const parsed = (value ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

/**
 * Cadena de proveedores, en orden de intento.
 *
 * OpenRouter va primero por ser gratuito. Si no hay clave, simplemente no
 * entra en la cadena y todo sigue funcionando con NVIDIA como hasta ahora.
 */
function providers(): Provider[] {
  const chain: Provider[] = [];

  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openrouterKey) {
    chain.push({
      name: "openrouter",
      baseUrl:
        process.env.OPENROUTER_BASE_URL?.trim() ||
        "https://openrouter.ai/api/v1",
      apiKey: openrouterKey,
      models: list(process.env.OPENROUTER_MODELS, DEFAULT_OPENROUTER_MODELS),
      // OpenRouter usa estas dos cabeceras para atribuir el tráfico. No son
      // obligatorias, pero sin ellas el consumo aparece como anónimo.
      extraHeaders: {
        "HTTP-Referer": process.env.SITE_URL || "https://bohochic.es",
        "X-Title": "Boho Chic",
      },
    });
  }

  const nvidiaKey = process.env.NVIDIA_API_KEY?.trim();
  if (nvidiaKey) {
    chain.push({
      name: "nvidia",
      baseUrl:
        process.env.NVIDIA_API_BASE_URL?.trim() ||
        "https://integrate.api.nvidia.com/v1",
      apiKey: nvidiaKey,
      models: list(
        process.env.NVIDIA_MODEL
          ? `${process.env.NVIDIA_MODEL},${process.env.NVIDIA_FALLBACK_MODELS ?? ""}`
          : undefined,
        // Comprobado contra la API: z-ai/glm-5.2 y
        // mistralai/mistral-small-4-119b-2603 responden ya 410 Gone, así que
        // no entran. Nemotron nano-omni contesta en ~1,6 s y llama-3.1 queda
        // de red de seguridad.
        [
          "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
          "meta/llama-3.1-70b-instruct",
        ]
      ),
      extraHeaders: {},
    });
  }

  return chain;
}

/** ¿Hay algún proveedor configurado? Para diagnóstico en el panel. */
export function hasLlm(): boolean {
  return providers().length > 0;
}

/** Nombres de los proveedores activos, en orden. */
export function llmChain(): string[] {
  return providers().map((p) => `${p.name}(${p.models.length})`);
}

function etiqueta(provider: Provider, model: string): string {
  // El id ya suele venir con el proveedor dentro ("nvidia/nemotron-..."),
  // y anteponerlo otra vez producia "nvidia/nvidia/nemotron-..." en los logs.
  return model.startsWith(`${provider.name}/`) ? model : `${provider.name}/${model}`;
}

async function callOnce(
  provider: Provider,
  model: string,
  messages: LlmMessage[],
  opts: LlmOptions
): Promise<LlmMessage> {
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
        ...provider.extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages,
        ...(opts.tools ? { tools: opts.tools, tool_choice: "auto" } : {}),
        temperature: 1,
        top_p: 1,
        max_tokens: opts.maxTokens ?? 8192,
        stream: false,
      }),
      cache: "no-store",
      // 90 s, no 45: medido, una ficha SEO real tarda ~33 s en ambos modelos
      // (el de razonamiento genera ~9.600 caracteres de pensamiento antes de
      // responder). Con 45 s el margen era tan estrecho que cualquier
      // variación provocaba un timeout... que costaba otros 45 s antes de
      // probar el siguiente modelo.
      signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`${etiqueta(provider, model)}: agotado el tiempo de espera`);
    }
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `${etiqueta(provider, model)}: HTTP ${response.status} ${detail.slice(0, 200)}`
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: LlmMessage }>;
    error?: { message?: string };
  };
  // OpenRouter puede responder 200 con un error dentro del cuerpo cuando el
  // modelo de destino falla; sin esto se devolvería un mensaje vacío como si
  // fuera válido.
  if (data.error?.message) {
    throw new Error(`${etiqueta(provider, model)}: ${data.error.message}`);
  }
  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error(`${etiqueta(provider, model)}: respuesta sin mensaje`);
  }

  // Un contenido vacío se trata como fallo para que la cadena pruebe el
  // siguiente modelo. Sin esto se devolvía como válido y reventaba mucho más
  // abajo, en el JSON.parse de quien llamó, con un error que no señalaba al
  // culpable y sin haber probado ninguna alternativa.
  //
  // La excepción son las llamadas con herramientas: ahí el modelo contesta
  // legítimamente con `tool_calls` y sin texto.
  const sinTexto = !message.content || message.content.trim().length === 0;
  const sinHerramientas =
    !Array.isArray(message.tool_calls) || message.tool_calls.length === 0;
  if (sinTexto && sinHerramientas) {
    throw new Error(`${etiqueta(provider, model)}: respuesta vacía`);
  }

  return message;
}

/**
 * Pide una respuesta al primer modelo que conteste.
 *
 * Recorre proveedor por proveedor y, dentro de cada uno, modelo por modelo.
 * Un 401/403 corta ese proveedor entero —la credencial es la misma para todos
 * sus modelos, así que insistir es perder tiempo— pero se sigue con el
 * siguiente proveedor. Un 429 o un modelo retirado solo descartan ese modelo.
 */
export async function chat(
  messages: LlmMessage[],
  opts: LlmOptions = {}
): Promise<LlmMessage> {
  const chain = providers();
  if (chain.length === 0) {
    throw new Error(
      "No hay ningún proveedor de IA configurado (OPENROUTER_API_KEY o NVIDIA_API_KEY)"
    );
  }

  let lastError: unknown;
  for (const provider of chain) {
    for (const model of provider.models) {
      try {
        return await callOnce(provider, model, messages, opts);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (/HTTP (401|403)/.test(message)) {
          console.warn(`[llm] credencial rechazada en ${provider.name}, se salta el proveedor`);
          break;
        }
        console.warn(`[llm] ${message.slice(0, 140)}`);
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Ningún modelo disponible");
}
