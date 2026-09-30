import { requirePageAccess } from "@/modules/auth";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export default async function Page() {
  await requirePageAccess(["ADMIN"]);
  return <StagePlaceholder title="Aprobaciones" stage="6" description="Solicitudes de descuento sobre el límite, para aprobar desde el celular." />;
}
