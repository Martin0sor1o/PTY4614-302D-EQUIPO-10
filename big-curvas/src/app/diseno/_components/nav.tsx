import { BadgeCheck, Boxes, ChartColumn, House, MapPin, Package, ShoppingBag, Truck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Direction } from "../_lib/directions";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", icon: House },
  { label: "Stock", icon: Boxes },
  { label: "POS", icon: ShoppingBag },
  { label: "Traslados", icon: Truck, badge: 2 },
  { label: "Pedidos", icon: Package, badge: 3 },
  { label: "Aprobaciones", icon: BadgeCheck, badge: 1 },
  { label: "Reportes", icon: ChartColumn },
];

export function CountBadge({ n, d, active, className }: { n: number; d: Direction; active?: boolean; className?: string }) {
  return (
    <span
      aria-label={`${n} pendiente${n === 1 ? "" : "s"}`}
      className={cn("inline-flex min-w-5 items-center justify-center px-1.5 text-[11px] leading-5 font-bold", d.ui.badge, className)}
      style={{
        background: active ? "var(--dir-badge-active-bg)" : "var(--dir-badge-bg)",
        color: active ? "var(--dir-badge-active-fg)" : "var(--dir-badge-fg)",
      }}
    >
      {n}
    </span>
  );
}

export function Who({ d }: { d: Direction }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 font-medium",
          d.id === "A" && "rounded-md border border-border",
          d.layout === "rail" && "rounded-full",
          d.layout === "rail" && (d.id === "D" ? "border border-[var(--dir-menu-fg)]/60" : "bg-card/70"),
          d.id === "C" && "rounded-[2px] border border-[var(--dir-accent)]",
        )}
      >
        <MapPin className="size-3.5" aria-hidden /> Tienda Rancagua
      </span>
      <span className="leading-tight">
        <b className="block font-semibold">Belén</b>
        <span className={d.id === "C" ? "opacity-85" : d.id === "D" ? "opacity-90" : "text-muted-foreground"}>Administradora</span>
      </span>
    </div>
  );
}
