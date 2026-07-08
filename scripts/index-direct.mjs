/**
 * Indexador directo (sin pasar por el endpoint serverless, así no hay timeout
 * de Vercel). Recorre los productos sin embebido y los cataloga+embebe uno a
 * uno con pausas para respetar el rate limit gratuito de NIM (~40 req/min).
 *
 *   node scripts/index-direct.mjs
 *
 * Reanudable e idempotente: solo procesa lo que falta.
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: [".env.local", ".env"] });
const sql = neon(process.env.DATABASE_URL);
const KEY = process.env.NVIDIA_API_KEY;
const EMBEDDING_MODEL = "nvidia/nv-embedqa-e5-v5";
const VISION_MODELS = [
  "meta/llama-4-maverick-17b-128e-instruct",
  "minimaxai/minimax-m3",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function vision(title, imageUrl) {
  const prompt = `Eres un catalogador experto de moda. Analiza la imagen de este producto y su título: ${title}. Responde ÚNICAMENTE con JSON: {"garment_description": string (40-60 palabras EN INGLÉS: tipo, colores, patrón, tejido, largo, mangas, escote, detalles, estilo), "attributes": {"type": "dress|kimono|top|blouse|skirt|pants|shorts|cardigan|jacket|earrings|necklace|bracelet|hat|bag|belt|shoes|other", "colors": [], "pattern": string, "fabric": string, "length": string, "sleeve": string, "neckline": string, "style_tags": [], "details": []}}`;
  for (const model of VISION_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: "Responde ÚNICAMENTE con JSON válido, sin markdown." },
              { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageUrl } }] },
            ],
            max_tokens: 500,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (r.status === 429) { await sleep(4000); continue; }
        if (!r.ok) break;
        const c = (await r.json()).choices?.[0]?.message?.content ?? "";
        const clean = c.replace(/```json/gi, "").replace(/```/g, "").trim();
        const start = clean.search(/[{[]/);
        return JSON.parse(clean.slice(start));
      } catch { await sleep(2000); }
    }
  }
  throw new Error("visión falló");
}

async function embed(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: [text.slice(0, 2000)], input_type: "passage", encoding_format: "float", truncate: "END" }),
      signal: AbortSignal.timeout(30000),
    });
    if (r.status === 429) { await sleep(4000); continue; }
    if (r.ok) return (await r.json()).data[0].embedding;
  }
  throw new Error("embed falló");
}

async function main() {
  const pending = await sql`
    SELECT p.id, p.title, p.description, p.image_url AS "imageUrl"
    FROM products p
    LEFT JOIN product_embeddings e ON e.product_id = p.id::text AND e.embedding_model = ${EMBEDDING_MODEL}
    WHERE e.id IS NULL AND p.is_active = true AND p.available = true
    ORDER BY p.id`;
  console.log(`Pendientes: ${pending.length}`);
  let ok = 0;
  for (const p of pending) {
    try {
      const cat = await vision(p.title, p.imageUrl);
      const emb = await embed(cat.garment_description);
      await sql`
        INSERT INTO product_embeddings (product_id, garment_description, attributes, embedding, embedding_model)
        VALUES (${p.id}, ${cat.garment_description}, ${JSON.stringify(cat.attributes)}::jsonb, ${"[" + emb.join(",") + "]"}::vector, ${EMBEDDING_MODEL})
        ON CONFLICT (product_id) DO UPDATE SET garment_description = EXCLUDED.garment_description, attributes = EXCLUDED.attributes, embedding = EXCLUDED.embedding`;
      ok++;
      if (ok % 10 === 0) console.log(`  ${ok}/${pending.length}…`);
    } catch (e) {
      console.log(`  saltado ${p.id}: ${e.message}`);
    }
    await sleep(1500); // ritmo para no exceder ~40 req/min
  }
  console.log(`✓ Indexados ${ok} de ${pending.length}.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
