import { requirePageAccess } from "@/modules/auth";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export default async function Page() {
  await requirePageAccess(["ADMIN", "BODEGA"]);
  return <StagePlaceholder title="Bodega" stage="5" description="Preparación (picking) y despacho de pedidos online." />;
}
