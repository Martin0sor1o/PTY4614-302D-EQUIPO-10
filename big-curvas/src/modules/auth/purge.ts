import { db } from "@/lib/db";

// `pnpm auth:purge` (manual, sin cron): ÚNICA excepción acotada a la regla 7 (sin borrado físico). Borra datos
// TÉCNICOS —sesiones vencidas o revocadas hace más de N días y contadores de intentos viejos—, nunca datos de negocio.
// Los dispositivos POS y los usuarios no se borran jamás (se revocan o desactivan). Ver ADR-020.

export interface PurgeResult {
  sessions: number;
  throttles: number;
}

export async function purgeAuthData(olderThanDays = 30): Promise<PurgeResult> {
  if (!Number.isInteger(olderThanDays) || olderThanDays < 1 || olderThanDays > 3650) {
    throw new Error("olderThanDays debe ser un entero entre 1 y 3650.");
  }
  const sessions = await db.$executeRaw`
    DELETE FROM sessions
    WHERE expires_at < now() - make_interval(days => ${olderThanDays}::int)
       OR (revoked_at IS NOT NULL AND revoked_at < now() - make_interval(days => ${olderThanDays}::int))`;
  const throttles = await db.$executeRaw`
    DELETE FROM auth_throttles
    WHERE updated_at < now() - make_interval(days => ${olderThanDays}::int)
      AND (locked_until IS NULL OR locked_until < now())`;
  return { sessions, throttles };
}
