import type { TransferStatus } from "@/modules/inventory";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  BORRADOR: "Borrador",
  EN_TRANSITO: "En tránsito",
  RECIBIDO: "Recibido",
  RECIBIDO_CON_DIFERENCIAS: "Recibido con diferencias",
  CERRADO: "Cerrado",
  ANULADO: "Anulado",
};

const STYLE: Record<TransferStatus, string> = {
  BORRADOR: "bg-muted text-foreground",
  EN_TRANSITO: "bg-sky-100 text-sky-900",
  RECIBIDO: "bg-emerald-100 text-emerald-900",
  RECIBIDO_CON_DIFERENCIAS: "bg-amber-100 text-amber-900",
  CERRADO: "bg-zinc-200 text-zinc-800",
  ANULADO: "bg-red-100 text-red-900 line-through",
};

export function TransferStatusBadge({ status, className }: { status: TransferStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(STYLE[status], className)} data-testid="transfer-status">
      {TRANSFER_STATUS_LABEL[status]}
    </Badge>
  );
}
