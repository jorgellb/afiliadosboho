/**
 * Cliente central de NVIDIA NIM (OpenAI-compatible) para los módulos del
 * Probador Boho. Reutiliza la misma API key/base URL que el asistente, pero
 * con cadena de modelos multimodales y utilidades de JSON robusto.
 *
 * IDs verificados contra la API real (2026-07-07): los tres responden 200.
 * - meta/llama-4-maverick-17b-128e-instruct  → multimodal, rápido (primario)
 * - minimaxai/minimax-m3                      → multimodal, lento ~15s (fallback 1)
 * - nvidia/llama-3.3-nemotron-super-49b-v1    → solo texto, rápido (fallback 2)
 */

const BASE_URL =
  process.env.NVIDIA_API_BASE_URL || "https://integrate.api.nvidia.com/v1";

interface ModelSpec {
  id: string;
  vision: boolean;
}

const MODEL_CHAIN: ModelSpec[] = [
  { id: "meta/llama-4-maverick-17b-128e-instruct", vision: true },
  { id: "minimaxai/minimax-m3", vision: true },
  { id: "nvidia/llama-3.3-nemotron-super-49b-v1", vision: false },
];

export type NvidiaContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export interface NvidiaMessage {
  role: "system" | "user" | "assistant";
  content: NvidiaContent;
}

export interface CallOptions {
  maxTokens?: number;
  temperature?: number;
  /** La tarea usa imagen: si se cae al modelo de solo texto, se avisa. */
  needsVision?: boolean;
  /** Solo modelos con visión (no tiene sentido caer a texto; falla antes). */
  visionOnly?: boolean;
  label?: string;
}

export interface CallResult {
  content: string;
  model: string;
  visionUsed: boolean;
}

// --- Límite de concurrencia global (~40 req/min del free tier de NIM) ---
const MAX_CONCURRENCY = 2;
let active = 0;
const queue: Array<() => void> = [];

async function withLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Elimina las imágenes de los mensajes para el modelo de solo texto. */
function stripImages(messages: NvidiaMessage[]): NvidiaMessage[] {
  return messages.map((m) => {
    if (typeof m.content === "string") return m;
    const text = m.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    return { ...m, content: text || "(imagen no disponible)" };
  });
}

async function requestModel(
  model: ModelSpec,
  messages: NvidiaMessage[],
  opts: CallOptions
): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("Falta la variable de entorno NVIDIA_API_KEY");

  const payload = model.vision ? messages : stripImages(messages);
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.id,
      messages: payload,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 1024,
      stream: false,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const err = new Error(`HTTP ${response.status} ${detail.slice(0, 160)}`);
    // @ts-expect-error etiqueta para la lógica de reintento
    err.status = response.status;
    throw err;
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("respuesta vacía");
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/**
 * Llama a la cadena de modelos: 3 intentos por modelo (backoff 1s, 3s) y salto
 * al siguiente ante 429/403/5xx/timeout. Devuelve el texto y qué modelo respondió.
 */
export async function callNvidia(
  messages: NvidiaMessage[],
  opts: CallOptions = {}
): Promise<CallResult> {
  return withLimit(async () => {
    // 2 intentos por modelo (backoff 1s). minimax-m3 tarda ~15s, así que más
    // reintentos dispararían el peor caso; el modelo degradado (texto) cubre bien.
    const backoff = [0, 1000];
    let lastError: unknown;

    const chain = opts.visionOnly
      ? MODEL_CHAIN.filter((m) => m.vision)
      : MODEL_CHAIN;
    for (const model of chain) {
      // Si la tarea necesita visión y este modelo no la tiene, es el degradado.
      const visionUsed = !opts.needsVision || model.vision;

      for (let attempt = 0; attempt < backoff.length; attempt++) {
        if (backoff[attempt]) await sleep(backoff[attempt]);
        try {
          const content = await requestModel(model, messages, opts);
          console.log(
            `[nvidia${opts.label ? ":" + opts.label : ""}] ${model.id} respondió (visión=${visionUsed})`
          );
          return { content, model: model.id, visionUsed };
        } catch (error) {
          lastError = error;
          const status = (error as { status?: number }).status;
          const isTimeout = error instanceof Error && error.name === "TimeoutError";
          // Un timeout significa que el modelo está colgado/degradado: NO se
          // reintenta el mismo (gastaría otro timeout entero), se pasa al
          // siguiente. Solo se reintenta ante 429/5xx (transitorios).
          const retriable = status === 429 || (status && status >= 500);
          if (isTimeout || !retriable) break;
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("todos los modelos de NVIDIA fallaron");
  });
}

// Modelo de embeddings del free tier de NIM (verificado: dim 1024).
export const EMBEDDING_MODEL = "nvidia/nv-embedqa-e5-v5";
export const EMBEDDING_DIM = 1024;

/**
 * Embedding de texto con nv-embedqa-e5-v5 (1024 dim). `inputType` debe ser
 * "passage" al indexar el catálogo y "query" al buscar. Pasa por la misma cola
 * global y reintenta ante 429/5xx.
 */
export async function embedText(
  text: string,
  inputType: "query" | "passage"
): Promise<number[]> {
  return withLimit(async () => {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) throw new Error("Falta la variable de entorno NVIDIA_API_KEY");
    const backoff = [0, 1000, 3000];
    let lastError: unknown;
    for (let attempt = 0; attempt < backoff.length; attempt++) {
      if (backoff[attempt]) await sleep(backoff[attempt]);
      try {
        const response = await fetch(`${BASE_URL}/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: [text.slice(0, 2000)],
            input_type: inputType,
            encoding_format: "float",
            truncate: "END",
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const err = new Error(`HTTP ${response.status} ${detail.slice(0, 120)}`);
          // @ts-expect-error etiqueta para reintento
          err.status = response.status;
          throw err;
        }
        const data = (await response.json()) as {
          data?: Array<{ embedding?: number[] }>;
        };
        const embedding = data.data?.[0]?.embedding;
        if (!embedding || embedding.length !== EMBEDDING_DIM) {
          throw new Error("embedding con dimensión inesperada");
        }
        return embedding;
      } catch (error) {
        lastError = error;
        const status = (error as { status?: number }).status;
        const isTimeout = error instanceof Error && error.name === "TimeoutError";
        if (!(isTimeout || status === 429 || (status && status >= 500))) throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("embeddings falló");
  });
}

/** Extrae el primer objeto/array JSON de un texto (quita ``` y ruido). */
function extractJson(text: string): string {
  let s = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = s.search(/[[{]/);
  if (start > 0) s = s.slice(start);
  const lastObj = s.lastIndexOf("}");
  const lastArr = s.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (end !== -1) s = s.slice(0, end + 1);
  return s.trim();
}

const JSON_RULE =
  "Responde ÚNICAMENTE con JSON válido, sin markdown, sin backticks, sin texto adicional.";

/**
 * Igual que callNvidia pero garantiza JSON: inyecta la regla, limpia la salida
 * y, si el parseo falla, hace UN reintento de reparación con el mismo modelo.
 */
export async function callNvidiaJson<T>(
  messages: NvidiaMessage[],
  opts: CallOptions = {}
): Promise<{ data: T; model: string; visionUsed: boolean }> {
  const withRule: NvidiaMessage[] = [
    { role: "system", content: JSON_RULE },
    ...messages,
  ];
  const res = await callNvidia(withRule, opts);

  const tryParse = (raw: string): T | null => {
    try {
      return JSON.parse(extractJson(raw)) as T;
    } catch {
      return null;
    }
  };

  let parsed = tryParse(res.content);
  if (parsed === null) {
    // Reintento de reparación: se le pasa su propia salida a corregir.
    const repair = await callNvidia(
      [
        { role: "system", content: JSON_RULE },
        {
          role: "user",
          content: `Convierte esto en JSON válido y devuélvelo tal cual, sin explicaciones:\n${res.content.slice(0, 2000)}`,
        },
      ],
      { ...opts, needsVision: false, visionOnly: false, maxTokens: opts.maxTokens ?? 1024 }
    );
    parsed = tryParse(repair.content);
    if (parsed === null) {
      throw new Error("No se pudo obtener JSON válido del modelo");
    }
  }
  return { data: parsed, model: res.model, visionUsed: res.visionUsed };
}
