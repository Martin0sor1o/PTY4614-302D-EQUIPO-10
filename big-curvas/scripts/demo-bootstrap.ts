// DEMO: pnpm demo:bootstrap → siembra la BD solo si está vacía (primer arranque en el hosting). Idempotente.
import { db } from "../src/lib/db";
import { seedDemoDataIfEmpty } from "../src/modules/demo";

async function main() {
  const started = Date.now();
  const result = await seedDemoDataIfEmpty();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (!result.seeded) {
    console.log(`[demo:bootstrap] La BD ya tiene datos de demo; no se siembra (${seconds} s).`);
    return;
  }
  const h = result.summary.history;
  console.log(
    `[demo:bootstrap] Datos de demo cargados en ${seconds} s` +
      (h ? ` (con historial: ${h.posSales} ventas POS, ${h.orders} pedidos online).` : " (sin historial)."),
  );
}

main()
  .catch((error) => {
    console.error("[demo:bootstrap] Falló la siembra:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
