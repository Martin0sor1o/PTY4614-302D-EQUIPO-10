export type Resolution = "MERMA" | "REENVIO" | "ERROR_ENVIO";

/** Textos de las resoluciones de diferencias (RN-30). Archivo sin "use client": lo usan páginas del servidor y componentes. */
export const RESOLUTION_LABEL: Record<Resolution, string> = {
  MERMA: "Merma (se perdió en el camino)",
  REENVIO: "Reenvío (se quedó en el origen)",
  ERROR_ENVIO: "Error de envío (la guía estaba mal)",
};

/** Nombre corto para tablas: "Merma", "Reenvío", "Error de envío". */
export const RESOLUTION_SHORT: Record<Resolution, string> = {
  MERMA: "Merma",
  REENVIO: "Reenvío",
  ERROR_ENVIO: "Error de envío",
};
