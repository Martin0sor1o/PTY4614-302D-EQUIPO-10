import type { Role } from "@/lib/access";
import { isDemoMode } from "@/lib/demo";

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
  { href: "/traslados", label: "Traslados", roles: ALL, stage: "4", description: "Enviar y recibir mercadería entre la tienda y la bodega" },
  { href: "/pedidos", label: "Pedidos", roles: ["ADMIN"], stage: "5", description: "Pedidos online: registrar, preparar y despachar (con contador de pedidos por preparar)" },
  { href: "/aprobaciones", label: "Aprobaciones", roles: ["ADMIN"], stage: "6", description: "Aprobar descuentos y anulaciones desde el celular (con contador de pendientes)" },
  { href: "/reportes", label: "Reportes", roles: ["ADMIN"], stage: "6.5", description: "Ventas por medio de pago, más vendidos, stock bajo, sin rotación y lista del viernes (solo lectura)" },
  // Autenticación real (ADR-020). No se muestra en la demo pública (DEMO_MODE): ver AppShell.
  { href: "/ajustes", label: "Ajustes", roles: ["ADMIN"], stage: "auth", description: "Dispositivos de caja, PIN de las vendedoras, contraseña y PIN propios" },
];

export function navItemsFor(role: Role): NavItem[] {
  // "Ajustes" (autenticación real) no aparece en la demo pública: allí todo entra sin contraseña y no hay nada que configurar.
  return NAV_ITEMS.filter((item) => item.roles.includes(role) && !(item.href === "/ajustes" && isDemoMode()));
}
