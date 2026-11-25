// pnpm auth:create-admin --email belen@ejemplo.cl --name "Belén"
//
// Crea la administradora inicial con una contraseña TEMPORAL: en su primer ingreso el sistema le obliga a cambiarla.
// La contraseña temporal sale de AUTH_INITIAL_PASSWORD (variable de entorno, SOLO en la terminal donde corre el script;
// nunca en Render ni en Neon) o de un prompt oculto. No se imprime. También hacen falta DATABASE_URL (o DIRECT_URL) y AUTH_SECRET.
import { db } from "../src/lib/db";
import { createAdminAccount } from "../src/modules/auth";
import { fail, refuseDemoMode, requireArg, secretFrom } from "./auth-cli";

async function main() {
  refuseDemoMode();
  const email = requireArg("email", "Ej.: pnpm auth:create-admin --email belen@ejemplo.cl --name \"Belén\"");
  const name = requireArg("name", "Ej.: --name \"Belén\"");
  const { value: password, fromEnv } = await secretFrom("AUTH_INITIAL_PASSWORD", "Contraseña temporal");
  const { userId } = await createAdminAccount({ email, name, password });
  console.log(`Administradora creada (id ${userId}). Deberá cambiar la contraseña temporal en su primer ingreso.`);
  if (fromEnv) console.log("Quita AUTH_INITIAL_PASSWORD de esta terminal:  Remove-Item Env:AUTH_INITIAL_PASSWORD");
}

main()
  .catch(fail)
  .finally(() => db.$disconnect());
