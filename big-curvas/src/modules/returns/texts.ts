// Frases en español del flujo de cambios y devoluciones. Puras y aptas para el navegador. Los códigos internos
// (DEBITO, ANULACION_TRANSBANK…) nunca se muestran pasándolos a minúsculas: pierden las tildes y se leen como código.

/** Cómo se nombra dentro de una frase el medio con que se devuelve el dinero. */
export const REFUND_METHOD_PHRASE = { EFECTIVO: "efectivo", ANULACION_TRANSBANK: "anulación en la máquina", TRANSFERENCIA: "transferencia" } as const;

const PAYMENT_METHOD_PHRASE: Record<string, string> = {
  EFECTIVO: "efectivo",
  DEBITO: "débito",
  CREDITO: "crédito",
  TRANSFERENCIA: "transferencia",
  VALE: "vale",
};

/** "pagada con débito", "pagada con vale + crédito". */
export function paidWithText(methods: readonly string[]): string {
  return `pagada con ${methods.map((m) => PAYMENT_METHOD_PHRASE[m] ?? m).join(" + ")}`;
}

/** Título del comprobante recién registrado, con la concordancia de cada tipo. */
export function returnDoneTitle(type: "DEVOLUCION" | "CAMBIO", number: string): string {
  return type === "CAMBIO" ? `Cambio ${number} registrado` : `Devolución ${number} registrada`;
}

export function daysText(days: number): string {
  return `${days} ${days === 1 ? "día" : "días"}`;
}
