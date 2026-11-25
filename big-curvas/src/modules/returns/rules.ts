// REGLAS 🟡 de cambios, devoluciones y vales (ADR-021). UN SOLO LUGAR: cada supuesto aprobado el 2026-11-25 vive aquí,
// con su pregunta para Belén. Los valores numéricos se pueden sobrescribir en `settings` (Belén los edita); sin fila rige el
// valor por omisión (producción aún no tiene bootstrap de settings). La UI marca 🟡 leyendo ESTE registro y un test
// verifica que cada id esté listado en docs/07_DECISIONES_Y_PREGUNTAS.md.
//
// Este archivo es PURO (sin Prisma ni Node): lo importan el servidor y el navegador. `getReturnPolicy` (lee `settings`) está en policy.ts.

/** Mismas claves/valores que el módulo vouchers (un test los compara): aquí no se importa para que este archivo sirva en el navegador. */
export const SETTING_VALIDITY_DAYS = "store_credit_validity_days";
export const VALIDITY_DAYS_DEFAULT = 90;
export const SETTING_RETURN_WINDOW_DAYS = "return_window_days";
export const RETURN_WINDOW_DAYS_DEFAULT = 30;
export const SETTING_VOUCHER_SELLER_CAP = "voucher_seller_cap";
export const VOUCHER_SELLER_CAP_DEFAULT = 50_000;

export type AssumptionQuestion = "P-09" | "P-16" | "P-17" | "P-22" | "Q-01";

export interface ReturnAssumption {
  id: string;
  /** Qué regla era ambigua. */
  title: string;
  /** Lo que el sistema hace hoy (🟡 hasta que Belén responda). */
  applied: string;
  /** Clave de `settings` que lo cambia (si es numérico); si no, es una constante de este módulo. */
  settingKey?: string;
  questions: readonly AssumptionQuestion[];
}

export const RETURN_ASSUMPTIONS: readonly ReturnAssumption[] = [
  {
    id: "S-01",
    title: "Plazo de cambio o devolución",
    applied: `${RETURN_WINDOW_DAYS_DEFAULT} días corridos desde la venta (pedido online: desde la entrega). Fuera de plazo pide aprobación de Belén.`,
    settingKey: SETTING_RETURN_WINDOW_DAYS,
    questions: ["P-09"],
  },
  {
    id: "S-02",
    title: "¿Hace falta la venta en el sistema?",
    applied: "Sí: solo se devuelven ventas registradas y no anuladas. Pedido online: solo despachado o entregado. Sin venta no hay flujo.",
    questions: ["P-09", "Q-01"],
  },
  {
    id: "S-03",
    title: "Estado de la prenda devuelta",
    applied: "Vendible (sin uso, con etiqueta): vuelve al stock. Dañada: entra y sale como merma, no vuelve a ser vendible.",
    questions: ["P-09"],
  },
  {
    id: "S-04",
    title: "Cuánto se devuelve",
    applied: "Lo que se pagó por la prenda (con el descuento de su línea), nunca el precio de lista de hoy. No incluye el envío.",
    questions: ["P-09"],
  },
  {
    id: "S-05",
    title: "Cambio por otro producto",
    applied: "Cualquier valor, sin descuentos en lo nuevo. Diferencia a pagar con un medio de pago; diferencia a favor queda en un vale (no en dinero).",
    questions: ["P-16"],
  },
  {
    id: "S-06",
    title: "Reembolso en dinero",
    applied:
      "La vendedora siempre necesita la aprobación de Belén. Medio sugerido: el original (efectivo, anulación en la máquina o transferencia). En efectivo se redondea a $10 y sale de la caja abierta.",
    questions: ["P-17", "P-09"],
  },
  {
    id: "S-07",
    title: "Venta pagada (en parte) con vale",
    applied: "Se devuelve solo en vale o cambio: un vale no se convierte en dinero.",
    questions: ["P-09"],
  },
  {
    id: "S-08",
    title: "Vale: vigencia, tope y uso",
    applied: `Vence a los ${VALIDITY_DAYS_DEFAULT} días; uso parcial permitido; no nominativo; la vendedora emite hasta $${VOUCHER_SELLER_CAP_DEFAULT.toLocaleString("es-CL")} por operación (sobre el tope pide aprobación); un vale vencido no se reactiva.`,
    settingKey: `${SETTING_VALIDITY_DAYS} · ${SETTING_VOUCHER_SELLER_CAP}`,
    questions: ["P-09"],
  },
  {
    id: "S-09",
    title: "Motivos de devolución (para el reporte)",
    applied: "Talla · Falla · No es lo esperado · Me arrepentí · Otro (con nota).",
    questions: ["P-09"],
  },
  {
    id: "S-10",
    title: "Dónde se procesa",
    applied:
      "En la tienda (vendedora o Belén) y en la bodega solo Belén (sin cambios ni efectivo). La prenda entra a la ubicación que la recibe. El envío de un cambio online no se automatiza: Belén registra un pedido nuevo con su envío.",
    questions: ["P-22", "P-09", "Q-01"],
  },
  {
    id: "S-11",
    title: "Anular una venta con devoluciones",
    applied: "No se puede anular una venta que ya tuvo devoluciones ni la venta de un cambio. Anular una venta pagada con vale repone el saldo del vale (sin extender su vencimiento).",
    questions: ["P-09"],
  },
  {
    id: "S-12",
    title: "Canje del vale",
    applied: "Cubre hasta su saldo y el resto va con otro medio. Vencido, desactivado o sin saldo se rechaza. Solo en el POS por ahora (pedidos online, después).",
    questions: ["P-09"],
  },
];

export const RETURN_REASONS = ["TALLA", "FALLA", "NO_ES_LO_ESPERADO", "ARREPENTIMIENTO", "OTRO"] as const;
export type ReturnReasonCode = (typeof RETURN_REASONS)[number];

export const RETURN_REASON_LABEL: Record<ReturnReasonCode, string> = {
  TALLA: "Talla",
  FALLA: "Falla",
  NO_ES_LO_ESPERADO: "No es lo esperado",
  ARREPENTIMIENTO: "Me arrepentí",
  OTRO: "Otro",
};
