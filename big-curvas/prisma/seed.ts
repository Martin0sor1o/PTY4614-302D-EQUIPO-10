// DEMO: pnpm db:seed → vacía las tablas y carga los datos de ejemplo (requiere DEMO_MODE=true).
//       pnpm db:seed:history → además genera ~8 semanas de ventas y pedidos para los reportes (Etapa 6.5).
import { db } from "../src/lib/db";
import { resetAndSeedDemoData } from "../src/modules/demo";

async function main() {
  const started = Date.now();
  const summary = await resetAndSeedDemoData({ history: process.argv.includes("--history") });
  console.log("Seed de demo cargado:");
  console.log(`  ubicaciones: ${summary.locations} · usuarios: ${summary.users}`);
  console.log(`  productos: ${summary.products} · variantes: ${summary.variants}`);
  for (const [code, units] of Object.entries(summary.unitsByLocation)) {
    console.log(`  stock ${code}: ${units} unidades`);
  }
  console.log(`  diferencias de ledger: ${summary.ledgerMismatches}`);
  if (summary.history) {
    const h = summary.history;
    console.log(`  historial: ${h.days} días de caja · ${h.posSales} ventas POS (${h.voidedSales} anuladas) · ${h.orders} pedidos online (${h.pendingRefunds} con reembolso pendiente)`);
  }
  console.log(`  tiempo: ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
