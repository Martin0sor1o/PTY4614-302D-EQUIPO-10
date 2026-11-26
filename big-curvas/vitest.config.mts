import { randomBytes, randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Prisma 7 y Vitest no cargan .env por sí solos (loadEnvFile no pisa variables ya definidas).
if (existsSync(".env")) process.loadEnvFile(".env");

// Secretos de PRUEBA: se generan en cada corrida y no salen de este proceso. No hay valores fijos en el repositorio
// (es público) ni se usan los reales del .env: el AUTH_SECRET y el PIN demo del entorno de desarrollo no entran a los tests.
const TEST_AUTH_SECRET = randomBytes(32).toString("hex");
const TEST_DEMO_ADMIN_PIN = String(randomInt(100_000, 1_000_000)); // 6 dígitos: nunca coincide con los PIN erróneos de los tests (4 dígitos)

// Archivos que prueban SOLO el login real (email + contraseña, vinculación de equipos), que sí exige AUTH_SECRET. Es una
// lista de exclusión a propósito: un test nuevo entra al perfil demo salvo que se agregue aquí.
const REAL_LOGIN_ONLY: string[] = [
  "src/modules/auth/crypto.test.ts", // prueba el propio HMAC
  // Email + contraseña, vinculación de equipos, PIN en un equipo vinculado y sus sesiones.
  "tests/integration/auth-app-layer.test.ts",
  "tests/integration/auth-audit.test.ts",
  "tests/integration/auth-concurrency.test.ts",
  "tests/integration/auth-cookies.test.ts",
  "tests/integration/auth-password-change.test.ts",
  "tests/integration/auth-password-login.test.ts",
  "tests/integration/auth-pos-devices.test.ts",
  "tests/integration/auth-pos-login.test.ts",
  "tests/integration/auth-purge.test.ts",
  "tests/integration/auth-sessions.test.ts",
  // Entra con sesiones del login real. Su equivalente con "Entrar como…" es demo-flows-actions.test.ts.
  "tests/integration/returns-actions.test.ts",
];

export default defineConfig(({ mode }) => {
  // PERFIL "demo" (`pnpm test:demo`): como el servicio de la demo en Render, DEMO_MODE=true y SIN AUTH_SECRET. Existe
  // porque con el secreto siempre inyectado nadie notó que el canje de vales lo exigía. El perfil por omisión lo inyecta.
  const demoProfile = mode === "demo";
  // Los workers heredan el entorno de este proceso: hay que quitar el que haya cargado el .env, no solo dejar de ponerlo.
  if (demoProfile) delete process.env.AUTH_SECRET;

  return {
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
      exclude: [...configDefaults.exclude, ...(demoProfile ? REAL_LOGIN_ONLY : [])],
      // Los tests de integración corren contra la BD de tests (Postgres real en Docker), nunca la de desarrollo.
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
        DEMO_MODE: "true",
        DEMO_ADMIN_PIN: TEST_DEMO_ADMIN_PIN,
        TEST_PROFILE: demoProfile ? "demo" : "default",
        ...(demoProfile ? {} : { AUTH_SECRET: TEST_AUTH_SECRET }),
      },
      globalSetup: ["tests/integration/global-setup.ts"],
      // Todos los archivos comparten la misma BD: se ejecutan de a uno.
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  };
});
