// API pública del módulo system: chequeos de infraestructura (health check del hosting).
import { db } from "@/lib/db";

/** true si la BD responde. Nunca lanza: el health check decide con el booleano. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
