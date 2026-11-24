import type { PoolConfig } from "pg";

// Opciones del pool de `pg` que usa el cliente de Prisma (adapter-pg). En Prisma 7 los parámetros
// `connection_limit` y `pool_timeout` de la URL no tienen efecto: el pool se configura aquí.
//
// Pensado para Neon (plan gratis): la app se conecta por el pooler (PgBouncer) y el cómputo se suspende
// tras 5 min sin actividad, así que:
// - connectionTimeoutMillis alto: la primera conexión después de una suspensión despierta el cómputo
//   (1 a 3 s normalmente); sin límite explícito `pg` esperaría para siempre.
// - idleTimeoutMillis bajo: se cierran las conexiones ociosas antes de que el servidor las corte.
// - max pequeño: el plan gratis tiene pocas conexiones y la app es de baja concurrencia.
export const DB_POOL_MAX = 5;
export const DB_CONNECTION_TIMEOUT_MS = 20_000;
export const DB_IDLE_TIMEOUT_MS = 10_000;

export function buildPoolConfig(connectionString: string): PoolConfig {
  return {
    connectionString,
    max: DB_POOL_MAX,
    connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
  };
}
