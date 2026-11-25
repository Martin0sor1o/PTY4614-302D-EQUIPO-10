// pnpm auth:reset-password --email belen@ejemplo.cl
//
// Recuperación SIN correo (no hay servicio de email): reinicia la contraseña con una temporal, cierra todas sus sesiones y
// obliga a cambiarla en el siguiente ingreso. La temporal sale de AUTH_INITIAL_PASSWORD (solo en esta terminal) o de un
// prompt oculto. No se imprime.
import { db } from "../src/lib/db";
import { resetPasswordAccount } from "../src/modules/auth";
import { fail, refuseDemoMode, requireArg, secretFrom } from "./auth-cli";

async function main() {
  refuseDemoMode();
  const email = requireArg("email", "Ej.: pnpm auth:reset-password --email belen@ejemplo.cl");
  const { value: password, fromEnv } = await secretFrom("AUTH_INITIAL_PASSWORD", "Contraseña temporal");
  const { userId } = await resetPasswordAccount({ email, password });
  console.log(`Contraseña reiniciada (id ${userId}); sus sesiones se cerraron y deberá cambiarla al ingresar.`);
  if (fromEnv) console.log("Quita AUTH_INITIAL_PASSWORD de esta terminal:  Remove-Item Env:AUTH_INITIAL_PASSWORD");
}

main()
  .catch(fail)
  .finally(() => db.$disconnect());
