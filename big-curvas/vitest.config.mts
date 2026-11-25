import { randomBytes, randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Prisma 7 y Vitest no cargan .env por sí solos (loadEnvFile no pisa variables ya definidas).
if (existsSync(".env")) process.loadEnvFile(".env");

// Secretos de PRUEBA: se generan en cada corrida y no salen de este proceso. No hay valores fijos en el repositorio
// (es público) ni se usan los reales del .env: el AUTH_SECRET y el PIN demo del entorno de desarrollo no entran a los tests.
const TEST_AUTH_SECRET = randomBytes(32).toString("hex");
const TEST_DEMO_ADMIN_PIN = String(randomInt(100_000, 1_000_000)); // 6 dígitos: nunca coincide con los PIN erróneos de los tests (4 dígitos)

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
      AUTH_SECRET: TEST_AUTH_SECRET,
      DEMO_ADMIN_PIN: TEST_DEMO_ADMIN_PIN,
    },
    globalSetup: ["tests/integration/global-setup.ts"],
    // Todos los archivos comparten la misma BD: se ejecutan de a uno.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
