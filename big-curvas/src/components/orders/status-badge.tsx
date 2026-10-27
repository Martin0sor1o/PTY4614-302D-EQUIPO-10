import type { OrderStatus } from "@/modules/orders";
import { Ban, CheckCheck, CircleCheck, ClipboardList, Clock, Hourglass, PackageCheck, Store, Truck, type LucideIcon } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

/** Etiquetas de estado de los pedidos (UI en español). Sin "use client": lo usan páginas del servidor y componentes. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDIENTE_PAGO: "Pendiente de pago",
  PAGADO: "Pagado",
  ESPERANDO_TRASPASO: "Esperando traslado",
  LISTO_PARA_PREPARAR: "Listo para preparar",
  PREPARADO: "Preparado",
  DESPACHADO: "Despachado",
  EN_CAMINO_A_TIENDA: "En camino a la tienda",
  LISTO_PARA_RETIRO: "Listo para retiro",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};

const STATUS: Record<OrderStatus, { tone: StatusTone; icon: LucideIcon }> = {
  PENDIENTE_PAGO: { tone: "warn", icon: Clock },
  PAGADO: { tone: "ok", icon: CircleCheck },
  ESPERANDO_TRASPASO: { tone: "violet", icon: Hourglass },
  LISTO_PARA_PREPARAR: { tone: "info", icon: ClipboardList },
  PREPARADO: { tone: "info", icon: PackageCheck },
  DESPACHADO: { tone: "info", icon: Truck },
  EN_CAMINO_A_TIENDA: { tone: "violet", icon: Truck },
  LISTO_PARA_RETIRO: { tone: "ok", icon: Store },
  ENTREGADO: { tone: "ok", icon: CheckCheck },
  CANCELADO: { tone: "danger", icon: Ban },
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const { tone, icon } = STATUS[status];
  return (
    <StatusBadge tone={tone} icon={icon} className={className} data-testid="order-status">
      {ORDER_STATUS_LABEL[status]}
    </StatusBadge>
  );
}

/** "hace 3 h", "hace 2 días": antigüedad en el estado actual (RF-PED-10). */
export function ageLabel(since: Date, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

/** Días completos en el estado actual, para marcar los pedidos que llevan mucho esperando. */
export function ageDays(since: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - since.getTime()) / 86_400_000);
}

export const CHANNEL_LABEL = { INSTAGRAM: "Instagram", WHATSAPP: "WhatsApp", POS: "Tienda", WEB: "Web" } as const;

export const PAYMENT_LABEL = { EFECTIVO: "Efectivo", DEBITO: "Débito", CREDITO: "Crédito", TRANSFERENCIA: "Transferencia", VALE: "Vale" } as const;
