// Textos de los avisos de confirmación. Puros: se arman con los datos que devolvió el servidor (nunca con lo escrito en
// pantalla). Devuelven null si esos datos todavía no muestran la acción hecha. Los códigos de vale van enmascarados.

import { formatCLP } from "@/lib/money";
import { maskVoucherCode } from "@/lib/pending-attempt";
import { TYPE_LABEL } from "@/components/approvals/labels";
import type { TransferDetail } from "@/modules/inventory";
import type { ReturnView } from "@/modules/returns/client";
import type { SaleView } from "@/modules/sales/client";

const SEP = " · ";

const REFUND_PHRASE: Record<string, string> = {
  EFECTIVO: "en efectivo",
  TRANSFERENCIA: "por transferencia",
  ANULACION_TRANSBANK: "por anulación en la máquina",
};

const changeOf = (payments: SaleView["payments"]) => payments.reduce((a, p) => a + (p.change ?? 0), 0);
const unitsText = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

/** "Venta RGA-000197 cobrada · $27.990 · vuelto $2.010". El vuelto aparece solo si hubo. */
export function saleFlashText(sale: Pick<SaleView, "number" | "status" | "payments">): string | null {
  if (sale.status !== "COMPLETADA") return null;
  const collected = sale.payments.reduce((a, p) => a + p.amount, 0);
  const change = changeOf(sale.payments);
  return [`Venta ${sale.number} cobrada`, formatCLP(collected), change > 0 ? `vuelto ${formatCLP(change)}` : null].filter(Boolean).join(SEP);
}

type ReturnData = Pick<ReturnView, "type" | "number" | "refundMethod" | "refundAmount" | "voucher">;

/**
 * Devolución: cuánto se devolvió y cómo. Cambio: cuánto pagó la clienta por la diferencia (y su vuelto), que sale de los
 * pagos de la venta nueva sin contar el vale que hace de crédito; si queda saldo a favor, el vale va enmascarado.
 */
export function returnFlashText(ret: ReturnData, exchangeSale: Pick<SaleView, "payments"> | null): string {
  const voucher = ret.voucher && ret.voucher.balance > 0 ? ret.voucher : null;
  if (ret.type === "CAMBIO") {
    const parts = [`Cambio ${ret.number} registrado`];
    if (exchangeSale) {
      const paid = exchangeSale.payments.filter((p) => p.method !== "VALE").reduce((a, p) => a + p.amount, 0);
      const change = changeOf(exchangeSale.payments);
      parts.push(paid > 0 ? `la clienta pagó ${formatCLP(paid)}` : "sin pago adicional");
      if (change > 0) parts.push(`vuelto ${formatCLP(change)}`);
    }
    if (voucher) parts.push(`saldo a favor ${formatCLP(voucher.balance)} (${maskVoucherCode(voucher.code)})`);
    return parts.join(SEP);
  }
  const parts = [`Devolución ${ret.number} registrada`];
  if (ret.refundMethod === "VALE" && voucher) parts.push(`${maskVoucherCode(voucher.code)} por ${formatCLP(voucher.balance)}`);
  else if (ret.refundAmount > 0) parts.push(`reembolso ${formatCLP(ret.refundAmount)} ${REFUND_PHRASE[ret.refundMethod] ?? ""}`.trim());
  return parts.join(SEP);
}

type TransferData = Pick<TransferDetail, "number" | "status" | "sentAt" | "receivedAt" | "toLocation"> & {
  lines: { qtySent: number; qtyReceived: number | null }[];
};

export function transferSentFlashText(t: TransferData): string | null {
  if (!t.sentAt || t.status === "ANULADO") return null;
  const units = t.lines.reduce((a, l) => a + l.qtySent, 0);
  return [`Traslado ${t.number} enviado`, `${unitsText(units)} hacia ${t.toLocation.name}`].join(SEP);
}

export function transferReceivedFlashText(t: TransferData): string | null {
  if (!t.receivedAt) return null;
  const sent = t.lines.reduce((a, l) => a + l.qtySent, 0);
  const received = t.lines.reduce((a, l) => a + (l.qtyReceived ?? 0), 0);
  const differences = t.lines.some((l) => l.qtyReceived !== null && l.qtyReceived !== l.qtySent);
  return [`Traslado ${t.number} recibido${differences ? " con diferencias" : ""}`, `${received} de ${unitsText(sent)}`].join(SEP);
}

/** Aprobar o rechazar no cambia de pantalla. Se arma con el estado que respondió el servidor; otro estado no avisa. */
export function approvalFlashText(
  status: string,
  card: { type: string; amount: number | null; requestedByName: string },
): { text: string; tone: "ok" | "neutral" } | null {
  const word = status === "APROBADA" ? "aprobada" : status === "RECHAZADA" ? "rechazada" : null;
  if (!word) return null;
  const text = [`Solicitud ${word}`, TYPE_LABEL[card.type] ?? card.type, card.amount !== null ? formatCLP(card.amount) : null, card.requestedByName]
    .filter(Boolean)
    .join(SEP);
  return { text, tone: status === "APROBADA" ? "ok" : "neutral" };
}
