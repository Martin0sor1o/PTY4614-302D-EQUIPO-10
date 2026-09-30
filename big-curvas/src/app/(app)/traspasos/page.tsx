import { requirePageAccess } from "@/modules/auth";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export default async function Page() {
  await requirePageAccess(["ADMIN", "VENDEDORA", "BODEGA"]);
  return <StagePlaceholder title="Traspasos" stage="4" description="Crear, enviar y recibir traspasos entre ubicaciones." />;
}
