import { drizzle } from "drizzle-orm/node-postgres";
import { getPool } from "./pool";
import * as schema from "./schema";

type Database = ReturnType<typeof createDb>;

function createDb() {
  return drizzle(getPool(), { schema });
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
