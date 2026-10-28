/**
 * Preferencia del riel lateral de escritorio. El estado abierto/contraído lo decide solo la persona con el botón del riel
 * (nunca la ruta ni el ancho) y se guarda en localStorage. Un script en <head> (ver app/layout.tsx) pone el atributo
 * `data-rail-collapsed` en <html> antes del primer pintado, y el riel se dibuja con CSS a partir de ese atributo.
 */
export const RAIL_ATTR = "data-rail-collapsed";
export const RAIL_STORAGE_KEY = "bc_rail";

/** Script que corre antes de pintar: lee la preferencia guardada. Sin localStorage, el riel queda abierto. */
export const RAIL_INIT_SCRIPT = `try{if(localStorage.getItem("${RAIL_STORAGE_KEY}")==="collapsed")document.documentElement.setAttribute("${RAIL_ATTR}","")}catch(e){}`;

export function setRailCollapsed(collapsed: boolean): void {
  if (collapsed) document.documentElement.setAttribute(RAIL_ATTR, "");
  else document.documentElement.removeAttribute(RAIL_ATTR);
  try {
    localStorage.setItem(RAIL_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    /* sin almacenamiento: la preferencia solo dura la visita */
  }
}
