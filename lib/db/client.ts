import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Database = ReturnType<typeof createDb>;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definida");
  return drizzle(neon(url), { schema });
}

let cached: Database | undefined;

// Inicialización perezosa: la conexión (y la validación de DATABASE_URL) solo
// ocurre en la primera consulta, no al importar el módulo durante el build.
export const db = new Proxy({} as Database, {
  get(_target, prop) {
    cached ??= createDb();
    const value = Reflect.get(cached, prop);
    return typeof value === "function" ? value.bind(cached) : value;
  },
});
