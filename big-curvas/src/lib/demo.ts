// DEMO: todo lo marcado como demo (login sin contraseña, reinicio de datos) depende de esta bandera.
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/**
 * DEMO: si el reinicio y la primera siembra incluyen el historial de 8 semanas (Etapa 6.5). Por omisión sí.
 * `DEMO_SEED_HISTORY=false` lo apaga (p. ej. si en el hosting gratuito el historial tarda demasiado).
 */
export function demoHistoryEnabled(): boolean {
  return process.env.DEMO_SEED_HISTORY !== "false";
}
