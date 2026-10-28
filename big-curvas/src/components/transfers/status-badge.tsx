import type { TransferStatus } from "@/modules/inventory";
import { Ban, CircleCheck, FileText, Lock, TriangleAlert, Truck, type LucideIcon } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  BORRADOR: "Borrador",
  EN_TRANSITO: "En tránsito",
  RECIBIDO: "Recibido",
  RECIBIDO_CON_DIFERENCIAS: "Recibido con diferencias",
  CERRADO: "Cerrado",
  ANULADO: "Anulado",
};

const STATUS: Record<TransferStatus, { tone: StatusTone; icon: LucideIcon }> = {
  BORRADOR: { tone: "neutral", icon: FileText },
  EN_TRANSITO: { tone: "info", icon: Truck },
  RECIBIDO: { tone: "ok", icon: CircleCheck },
  RECIBIDO_CON_DIFERENCIAS: { tone: "warn", icon: TriangleAlert },
  CERRADO: { tone: "neutral", icon: Lock },
  ANULADO: { tone: "danger", icon: Ban },
};

export function TransferStatusBadge({ status, className }: { status: TransferStatus; className?: string }) {
  const { tone, icon } = STATUS[status];
  return (
    <StatusBadge tone={tone} icon={icon} className={cn(status === "ANULADO" && "line-through", className)} data-testid="transfer-status">
      {TRANSFER_STATUS_LABEL[status]}
    </StatusBadge>
  );
}
