import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db/pool";
import { decomposeLook, matchItem, Match } from "@/lib/find-look";

// Margen para el peor caso (si el modelo rápido se cuelga y cae al lento ~27s).
export const maxDuration = 120;

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB tras compresión en cliente
const SESSION_COOKIE = "look_session";
const PER_SESSION_HOUR = 15;
const MAX_DAILY = Number(process.env.MAX_DAILY_SEARCHES || 300);



export async function POST(request: Request) {
  // 1. Imagen (multipart), comprimida en cliente.
  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("image");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: "Formato de subida inválido" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "Falta la imagen" }, { status: 400 });
  }
  if (!/^image\/(jpe?g|png|webp)$/.test(file.type)) {
    return NextResponse.json({ error: "Sube una imagen JPG, PNG o WEBP" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "La imagen es demasiado grande. Debe comprimirse antes de subir." },
      { status: 413 }
    );
  }

  // 2. Sesión anónima por cookie.
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  const sessionId = match?.[1] ?? randomUUID();

  const db = sql;
  // 3. Rate limits (por conteo en BD, sin dependencias de pago).
  const [{ daily }] = (await db`
    SELECT count(*)::int AS daily FROM look_searches WHERE created_at::date = current_date
  `) as Array<{ daily: number }>;
  if (daily >= MAX_DAILY) {
    return NextResponse.json(
      { error: "Hemos alcanzado el máximo de búsquedas de hoy. Vuelve mañana 🌙" },
      { status: 429 }
    );
  }
  const [{ hour }] = (await db`
    SELECT count(*)::int AS hour FROM look_searches
    WHERE session_id = ${sessionId} AND created_at > now() - interval '1 hour'
  `) as Array<{ hour: number }>;
  if (hour >= PER_SESSION_HOUR) {
    return NextResponse.json(
      { error: "Has hecho muchas búsquedas seguidas. Espera un poco e inténtalo de nuevo." },
      { status: 429 }
    );
  }

  // 4. Imagen → data URI (no se almacena en ningún sitio).
  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUri = `data:${file.type};base64,${buffer.toString("base64")}`;

  try {
    // 5. Descomponer el outfit.
    const look = await decomposeLook(dataUri);
    if (!look.person_detected || look.items.length === 0) {
      return NextResponse.json({
        personDetected: look.person_detected,
        overallStyle: look.overall_style,
        items: [],
        message:
          "No hemos identificado prendas claras en la imagen. Prueba con una foto donde se vea bien el look.",
      });
    }

    // 6. Buscar por cada prenda visible (secuencial, respeta la cola de NIM).
    const items: Array<{
      itemName: string;
      type: string;
      matches: Match[];
    }> = [];
    for (const item of look.items) {
      if (item.visible_enough === false) continue;
      let matches: Match[] = [];
      try {
        matches = await matchItem(item);
      } catch (error) {
        console.error("Error emparejando prenda:", error);
      }
      items.push({
        itemName: item.item_name,
        type: item.attributes?.type ?? "other",
        matches,
      });
    }

    // 7. Guardar la búsqueda (sin imagen).
    const searchId = randomUUID();
    await db`
      INSERT INTO look_searches (id, session_id, source_image_url, detected_items, results)
      VALUES (
        ${searchId}, ${sessionId}, '',
        ${JSON.stringify(look.items.map((i) => i.item_name))}::jsonb,
        ${JSON.stringify(items)}::jsonb
      )
    `;

    const response = NextResponse.json({
      searchId,
      personDetected: true,
      overallStyle: look.overall_style,
      items,
    });
    if (!match) {
      response.cookies.set(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  } catch (error) {
    console.error("Error en find-look:", error);
    return NextResponse.json(
      { error: "No hemos podido analizar el look. Inténtalo de nuevo en un momento." },
      { status: 502 }
    );
  }
}
