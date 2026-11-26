// API pública del módulo system: chequeos de infraestructura (health check del hosting).
import { db } from "@/lib/db";
import { logUnexpectedError } from "@/lib/log-error";

/** true si la BD responde. Nunca lanza: el health check decide con el booleano. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logUnexpectedError(error);
    return false;
  }
}
