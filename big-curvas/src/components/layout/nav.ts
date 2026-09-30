import type { Role } from "@/lib/access";

export interface NavItem {
  href: string;
  label: string;
  roles: readonly Role[];
  /** Etapa de la demo en la que se implementa la pantalla (informativo). */
  stage: string;
  description: string;
}

const ALL: readonly Role[] = ["ADMIN", "VENDEDORA", "BODEGA"];

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Inicio", roles: ALL, stage: "1", description: "Guion de la demo" },
  { href: "/stock", label: "Stock", roles: ALL, stage: "2", description: "Matriz de stock por ubicación y kardex" },
  { href: "/pos", label: "POS", roles: ["ADMIN", "VENDEDORA"], stage: "3", description: "Venta en tienda con lector de códigos" },
  { href: "/traspasos", label: "Traspasos", roles: ALL, stage: "4", description: "Enviar y recibir mercadería entre ubicaciones" },
  { href: "/pedidos", label: "Pedidos online", roles: ["ADMIN"], stage: "5", description: "Pedidos de Instagram y su tablero" },
  { href: "/bodega", label: "Bodega", roles: ["ADMIN", "BODEGA"], stage: "5", description: "Preparar y despachar pedidos" },
  { href: "/aprobaciones", label: "Aprobaciones", roles: ["ADMIN"], stage: "6", description: "Aprobar descuentos desde el celular" },
];

export function navItemsFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
