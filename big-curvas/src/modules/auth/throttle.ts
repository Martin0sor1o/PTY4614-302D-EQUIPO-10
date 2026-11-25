import { db } from "@/lib/db";

// Intentos fallidos por clave (tabla auth_throttles). La clave es un HMAC (src/modules/auth/crypto.ts), así que el
// mismo trato se da a una cuenta que existe y a una que no: no se puede averiguar si un email está registrado.
//
// Todo se hace con la hora de la BD y de forma atómica (INSERT … ON CONFLICT DO UPDATE), como el bloqueo del PIN en
// `approvals`. Un bloqueo ya vencido se reinicia solo al siguiente fallo; no se borran filas (solo `pnpm auth:purge`).

/** Hasta cuándo está bloqueada la clave, o null si no lo está. */
export async function lockedUntil(key: string): Promise<Date | null> {
  const rows = await db.$queryRaw<{ locked_until: Date }[]>`
    SELECT locked_until FROM auth_throttles WHERE key = ${key} AND locked_until IS NOT NULL AND locked_until > now()`;
  return rows[0]?.locked_until ?? null;
}

/** Registra un fallo. Devuelve cuántos van y, si con este se alcanzó el máximo, hasta cuándo queda bloqueada. */
export async function registerFailure(
  key: string,
  maxAttempts: number,
  lockMinutes: number,
): Promise<{ attempts: number; lockedUntil: Date | null; justLocked: boolean }> {
  const rows = await db.$queryRaw<{ failed_attempts: number; locked_until: Date | null }[]>`
    INSERT INTO auth_throttles AS t (key, failed_attempts, locked_until, updated_at)
    VALUES (
      ${key}, 1,
      CASE WHEN 1 >= ${maxAttempts} THEN now() + make_interval(mins => ${lockMinutes}::int) ELSE NULL END,
      now()
    )
    ON CONFLICT (key) DO UPDATE SET
      failed_attempts = CASE
        WHEN t.locked_until IS NOT NULL AND t.locked_until <= now() THEN 1
        ELSE t.failed_attempts + 1 END,
      locked_until = CASE
        WHEN t.locked_until IS NOT NULL AND t.locked_until > now() THEN t.locked_until
        WHEN (CASE WHEN t.locked_until IS NOT NULL AND t.locked_until <= now() THEN 1 ELSE t.failed_attempts + 1 END) >= ${maxAttempts}
          THEN now() + make_interval(mins => ${lockMinutes}::int)
        ELSE NULL END,
      updated_at = now()
    RETURNING t.failed_attempts, t.locked_until`;
  const row = rows[0];
  return {
    attempts: row.failed_attempts,
    lockedUntil: row.locked_until,
    // Los fallos se aplican de uno en uno (bloqueo de fila): solo UNO deja el contador justo en el máximo, y ese es el que
    // bloquea. Con fallos simultáneos no se duplica el aviso. Tras un bloqueo vencido el contador vuelve a 1.
    justLocked: row.locked_until !== null && row.failed_attempts === maxAttempts,
  };
}

/** Éxito: la cuenta vuelve a cero intentos. No borra la fila. */
export async function clearFailures(key: string): Promise<void> {
  await db.$executeRaw`
    UPDATE auth_throttles SET failed_attempts = 0, locked_until = NULL, updated_at = now()
    WHERE key = ${key} AND (failed_attempts <> 0 OR locked_until IS NOT NULL)`;
}
