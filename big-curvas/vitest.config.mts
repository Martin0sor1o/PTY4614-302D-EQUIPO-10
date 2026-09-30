import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Prisma 7 y Vitest no cargan .env por sí solos (loadEnvFile no pisa variables ya definidas).
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Los tests de integración corren contra la BD de tests (Postgres real en Docker), nunca la de desarrollo.
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      DEMO_MODE: "true",
    },
    globalSetup: ["tests/integration/global-setup.ts"],
    // Todos los archivos comparten la misma BD: se ejecutan de a uno.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
