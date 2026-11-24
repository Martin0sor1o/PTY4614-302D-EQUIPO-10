import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 ya no carga .env por sí solo.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // El CLI (migrate deploy, seed) usa la conexión DIRECTA (DIRECT_URL): las migraciones toman un advisory lock
    // que no funciona a través del pooler (PgBouncer) de Neon. Sin DIRECT_URL (local, tests) usa DATABASE_URL.
    // La app en runtime usa solo DATABASE_URL (en Neon, la cadena pooled) vía src/lib/db.ts.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
