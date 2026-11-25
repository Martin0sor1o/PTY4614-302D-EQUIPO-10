// pnpm auth:purge [--days 30]
//
// Borra DATOS TÉCNICOS de autenticación: sesiones vencidas o revocadas hace más de N días (30 por omisión) y contadores
// de intentos viejos. Manual, sin cron. Es la única excepción acotada a la regla de no borrado físico (ADR-020): no
// toca usuarios, dispositivos ni ningún dato de negocio.
import { db } from "../src/lib/db";
import { purgeAuthData } from "../src/modules/auth";
import { arg, fail } from "./auth-cli";

async function main() {
  const days = arg("days") === undefined ? 30 : Number(arg("days"));
  const result = await purgeAuthData(days);
  console.log(`Purga (más de ${days} días): ${result.sessions} sesiones y ${result.throttles} contadores de intentos borrados.`);
}

main()
  .catch(fail)
  .finally(() => db.$disconnect());
