import { requirePageAccess } from "@/modules/auth";
import { StagePlaceholder } from "@/components/layout/stage-placeholder";

export default async function Page() {
  await requirePageAccess(["ADMIN", "VENDEDORA", "BODEGA"]);
  return <StagePlaceholder title="Stock" stage="2" description="Matriz de stock por variante × ubicación, búsqueda y kardex." />;
}
