import { requirePageAccess } from "@/modules/auth";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export default async function Page() {
  await requirePageAccess(["ADMIN", "VENDEDORA"]);
  return <StagePlaceholder title="POS" stage="3" description="Venta en tienda con lector de códigos, carrito, pagos y caja." />;
}
