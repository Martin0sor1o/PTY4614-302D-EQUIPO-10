// API pública del módulo reports (Etapa 6.5): reportes y dashboard para la administradora.
// SOLO LECTURA: ninguna función escribe en la BD (CLAUDE.md regla 1) y todas exigen rol ADMIN en el servidor (regla 10).
// Fechas: días, semanas (lunes a domingo) y meses se agrupan en America/Santiago (regla 11).

export { getSalesByPaymentMethod, getSalesSummaryCards } from "./sales";
export { getTopSellers, getNoRotation, getFridayList } from "./products";
export { getLowStock } from "./stock";
export { MAX_RANGE_DAYS } from "./schemas";
export type * from "./types";
