import { requirePageAccess } from "@/modules/auth";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export default async function Page() {
  await requirePageAccess(["ADMIN"]);
  return <StagePlaceholder title="Pedidos online" stage="5" description="Registro de pedidos de Instagram y tablero por estado." />;
}
