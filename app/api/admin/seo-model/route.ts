import { NextResponse } from "next/server";
import { z } from "zod";
import { listFreeModels } from "@/lib/openrouter-models";
import { SETTING_SEO_MODEL, clearSetting, getSetting, setSetting } from "@/lib/settings";
import { chat, hasOpenRouter } from "@/lib/llm";

// Probar un modelo con el prompt real puede tardar; medido, ~33 s.
export const maxDuration = 120;

/** Catálogo gratuito disponible + cuál está elegido ahora. */
export async function GET() {
  try {
    const [models, selected] = await Promise.all([
      listFreeModels(),
      getSetting(SETTING_SEO_MODEL),
    ]);
    return NextResponse.json({
      models,
      selected,
      openRouterConfigured: hasOpenRouter(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al listar modelos" },
      { status: 502 }
    );
  }
}

const selectSchema = z.object({
  /** null o cadena vacía = volver al orden por defecto del código. */
  model: z.string().max(200).nullable(),
});

/** Fija el modelo que redactará las fichas. */
export async function PUT(request: Request) {
  const parsed = selectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const model = parsed.data.model?.trim();
  if (!model) {
    await clearSetting(SETTING_SEO_MODEL);
    return NextResponse.json({ selected: null });
  }

  await setSetting(SETTING_SEO_MODEL, model);
  return NextResponse.json({ selected: model });
}

const testSchema = z.object({ model: z.string().min(1).max(200) });

/**
 * Prueba un modelo con el prompt REAL de fichas.
 *
 * Es la única forma de saber si "lo hace bien": un modelo puede responder
 * rápido a un saludo y luego devolver JSON roto ante el prompt de producción,
 * que es largo y con reglas estrictas. Se devuelve lo que redactó, cuánto
 * tardó y si el JSON era válido, para poder comparar candidatos.
 */
export async function POST(request: Request) {
  const parsed = testSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta el modelo" }, { status: 400 });
  }
  if (!hasOpenRouter()) {
    return NextResponse.json(
      { error: "Falta OPENROUTER_API_KEY: no se puede probar ningún modelo" },
      { status: 400 }
    );
  }

  const prompt = `Eres redactor SEO senior de "Boho Chic", una tienda online de moda bohemia en español.

Responde SOLO con este JSON, sin texto extra:
{
  "titulo": "título comercial claro y natural, 45-65 caracteres",
  "meta_title": "máximo 60 caracteres incluyendo el sufijo ' | Boho Chic'",
  "meta_description": "entre 140 y 155 caracteres: beneficio + gancho + llamada a la acción",
  "descripcion": "60-90 palabras en 2 párrafos cortos, tono editorial",
  "tags": ["4-8 palabras clave en español, minúsculas"]
}

Reglas: nada de relleno; NO inventes tallas, materiales ni composición.

Producto:
- Título original: Vestido Largo Bohemio de Verano con Estampado Floral y Mangas Abullonadas
- Categoría: vestidos
- Precio: 18.40 EUR`;

  const inicio = Date.now();
  try {
    const message = await chat([{ role: "user", content: prompt }], {
      maxTokens: 4096,
      preferredModel: parsed.data.model,
      // Sin caer a otros: se mide ESTE modelo, no a su sustituto.
      onlyPreferred: true,
      timeoutMs: 100_000,
    });
    const segundos = Number(((Date.now() - inicio) / 1000).toFixed(1));
    const raw = (message.content ?? "").replace(/```json|```/g, "").trim();

    let jsonValido = false;
    let muestra: Record<string, unknown> | null = null;
    try {
      muestra = JSON.parse(raw) as Record<string, unknown>;
      jsonValido = true;
    } catch {
      jsonValido = false;
    }

    return NextResponse.json({
      ok: true,
      segundos,
      jsonValido,
      // Se devuelven los campos clave para poder juzgar la calidad de un
      // vistazo, no solo si el JSON parseaba.
      titulo: muestra?.titulo ?? null,
      metaDescription: muestra?.meta_description ?? null,
      descripcion: muestra?.descripcion ?? null,
      bruto: jsonValido ? null : raw.slice(0, 400),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      segundos: Number(((Date.now() - inicio) / 1000).toFixed(1)),
      error: error instanceof Error ? error.message.slice(0, 240) : "error",
    });
  }
}
