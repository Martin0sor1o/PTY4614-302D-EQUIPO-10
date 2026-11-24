import { describe, expect, it } from "vitest";
import { buildPoolConfig, DB_CONNECTION_TIMEOUT_MS, DB_IDLE_TIMEOUT_MS, DB_POOL_MAX } from "./db-config";

describe("buildPoolConfig", () => {
  const url = "postgresql://user:pass@host.example/db?sslmode=require";

  it("conserva la cadena de conexión tal cual", () => {
    expect(buildPoolConfig(url).connectionString).toBe(url);
  });

  it("limita el pool a 5 conexiones", () => {
    expect(buildPoolConfig(url).max).toBe(5);
    expect(DB_POOL_MAX).toBe(5);
  });

  it("espera hasta 20 s al conectar (cold start de Neon)", () => {
    expect(buildPoolConfig(url).connectionTimeoutMillis).toBe(20_000);
    expect(DB_CONNECTION_TIMEOUT_MS).toBe(20_000);
  });

  it("cierra conexiones ociosas a los 10 s, antes del autosuspend", () => {
    expect(buildPoolConfig(url).idleTimeoutMillis).toBe(10_000);
    expect(DB_IDLE_TIMEOUT_MS).toBe(10_000);
  });
});
