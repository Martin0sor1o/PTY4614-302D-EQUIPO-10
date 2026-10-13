import type { OrderStatus } from "@/modules/orders";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

const STYLE: Record<OrderStatus, string> = {
  PENDIENTE_PAGO: "bg-amber-100 text-amber-900",
  PAGADO: "bg-sky-100 text-sky-900",
  ESPERANDO_TRASPASO: "bg-violet-100 text-violet-900",
  LISTO_PARA_PREPARAR: "bg-sky-100 text-sky-900",
  PREPARADO: "bg-indigo-100 text-indigo-900",
  DESPACHADO: "bg-teal-100 text-teal-900",
  EN_CAMINO_A_TIENDA: "bg-violet-100 text-violet-900",
  LISTO_PARA_RETIRO: "bg-teal-100 text-teal-900",
  ENTREGADO: "bg-emerald-100 text-emerald-900",
  CANCELADO: "bg-red-100 text-red-900",
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(STYLE[status], className)} data-testid="order-status">
      {ORDER_STATUS_LABEL[status]}
    </Badge>
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
