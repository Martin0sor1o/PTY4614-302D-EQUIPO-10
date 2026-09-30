import { execSync } from "node:child_process";

/**
 * Aplica las migraciones a la BD de tests antes de correr la suite.
 * Salvaguarda: se niega a correr si TEST_DATABASE_URL no apunta a una BD cuyo nombre termine en `_test`,
 * porque los tests vacían las tablas.
 */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL no está definida (ver .env.example)");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL debe apuntar a una BD *_test (recibí "${dbName}")`);
  }
  execSync("pnpm exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
