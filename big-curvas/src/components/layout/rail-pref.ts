/** Preferencia del riel lateral (sin "use client": la leen el servidor y el cliente). */
export const RAIL_COOKIE = "bc_rail";

/**
 * Pantallas críticas (caja, escaneo de traslados, picking, aprobaciones): el riel parte en solo íconos
 * para no perder ancho útil. El botón del riel puede expandirlo temporalmente.
 */
const CRITICAL_ROUTES = [
  /^\/pos(\/|$)/,
  /^\/aprobaciones(\/|$)/,
  /^\/traslados\/nuevo$/,
  /^\/traslados\/[^/]+\/(editar|recibir)$/,
  /^\/pedidos\/[^/]+\/preparar$/,
];

export function isCriticalRoute(pathname: string): boolean {
  return CRITICAL_ROUTES.some((re) => re.test(pathname));
}
