import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js usa .env.local en desarrollo; drizzle-kit corre fuera de Next.
config({ path: [".env.local", ".env"] });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
