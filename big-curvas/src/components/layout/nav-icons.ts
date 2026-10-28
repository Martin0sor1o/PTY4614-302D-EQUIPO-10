import { BadgeCheck, Boxes, ChartColumn, House, Package, ShoppingBag, Truck, type LucideIcon } from "lucide-react";

/** Ícono de cada pantalla del menú (lo usan el riel, el menú móvil y el inicio). */
export const NAV_ICONS: Record<string, LucideIcon> = {
  "/": House,
  "/stock": Boxes,
  "/pos": ShoppingBag,
  "/traslados": Truck,
  "/pedidos": Package,
  "/aprobaciones": BadgeCheck,
  "/reportes": ChartColumn,
};
