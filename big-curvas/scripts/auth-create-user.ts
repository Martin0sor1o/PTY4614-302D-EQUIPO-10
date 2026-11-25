// pnpm auth:create-user --name "Vendedora Rancagua" --location TIENDA_RANCAGUA [--no-pin]
//
// Crea una VENDEDORA (sin email ni contraseña: entra con el equipo de la caja vinculado y su PIN de 6 dígitos).
// El PIN sale de AUTH_INITIAL_PIN (solo en esta terminal) o de un prompt oculto; con --no-pin se crea sin PIN y la
// administradora lo define después en Ajustes → Equipo. No se imprime.
import { db } from "../src/lib/db";
import { createSalesAccount } from "../src/modules/auth";
import { fail, flag, refuseDemoMode, requireArg, secretFrom } from "./auth-cli";

async function main() {
  refuseDemoMode();
  const name = requireArg("name", "Ej.: --name \"Vendedora Rancagua\"");
  const locationCode = requireArg("location", "Código de la tienda, ej.: --location TIENDA_RANCAGUA");
  const pin = flag("no-pin") ? undefined : (await secretFrom("AUTH_INITIAL_PIN", "PIN (6 dígitos)")).value;
  const { userId } = await createSalesAccount({ name, locationCode, pin });
  console.log(`Vendedora creada (id ${userId})${pin ? " con PIN" : " sin PIN: defínelo en Ajustes → Equipo"}.`);
}

main()
  .catch(fail)
  .finally(() => db.$disconnect());
