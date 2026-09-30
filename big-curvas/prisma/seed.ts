// DEMO: pnpm db:seed → vacía las tablas y carga los datos de ejemplo (requiere DEMO_MODE=true).
import { db } from "../src/lib/db";
import { resetAndSeedDemoData } from "../src/modules/demo";

async function main() {
  const summary = await resetAndSeedDemoData();
  console.log("Seed de demo cargado:");
  console.log(`  ubicaciones: ${summary.locations} · usuarios: ${summary.users}`);
  console.log(`  productos: ${summary.products} · variantes: ${summary.variants}`);
  for (const [code, units] of Object.entries(summary.unitsByLocation)) {
    console.log(`  stock ${code}: ${units} unidades`);
  }
  console.log(`  diferencias de ledger: ${summary.ledgerMismatches}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
