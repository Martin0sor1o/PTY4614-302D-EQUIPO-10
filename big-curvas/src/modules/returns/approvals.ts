import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { formatCLP } from "@/lib/money";
import { parseInput } from "@/lib/validation";
import { createApprovalRequest } from "@/modules/approvals";
import { quoteReturn } from "./quote";
import { RETURN_REASON_LABEL } from "./rules";
import { requestReturnApprovalSchema, type ReturnLineInput, type ReturnResolutionInput } from "./schemas";
import { daysText, REFUND_METHOD_PHRASE } from "./texts";

// Solicitud de aprobación de una devolución o cambio (RF-AUT-01, ADR-014). `approvals` no sabe de devoluciones: aquí se arma
// el BINDING (en quote.ts) y el MONTO (el valor devuelto); `createReturn` los recalcula al usar la aprobación y deben coincidir.

const DESTINATION: Record<ReturnResolutionInput["kind"], string> = {
  VALE: "Vale para la clienta",
  DINERO: "Reembolso en dinero",
  CAMBIO: "Cambio por otra prenda",
};

/**
 * La vendedora pide a Belén aprobar una devolución o cambio fuera de regla: reembolso en dinero, fuera de plazo o vale sobre
 * el tope (S-01, S-06, S-08). Los montos los calcula el servidor. Una sola aprobación cubre toda la operación.
 */
export async function requestReturnApproval(input: {
  actor: Actor;
  locationId: string;
  saleId: string;
  lines: ReturnLineInput[];
  resolution: ReturnResolutionInput;
  reason: string;
  reasonNote?: string;
  idempotencyKey: string;
}) {
  assertAccess(input.actor, { roles: ["VENDEDORA"], locationId: input.locationId });
  const data = parseInput(requestReturnApprovalSchema, input);
  const quote = await quoteReturn({ actor: input.actor, locationId: data.locationId, saleId: data.saleId, lines: data.lines, resolution: data.resolution });
  if (!quote.approval.required || !quote.approval.type) {
    throw new AppError("VALIDATION", "Esta devolución no necesita la aprobación de Belén: puedes confirmarla directamente.");
  }

  const motive = RETURN_REASON_LABEL[data.reason as keyof typeof RETURN_REASON_LABEL] ?? data.reason;
  const reason = data.reasonNote ? `${motive}: ${data.reasonNote}` : motive;
  const units = quote.lines.reduce((a, l) => a + l.qty, 0);
  const display = {
    headline: `${DESTINATION[quote.resolution]} · ${formatCLP(quote.valueReturned)} · ${units} ${units === 1 ? "prenda" : "prendas"} de la venta ${quote.saleNumber}`,
    lines: [
      { label: "Por qué necesita tu aprobación", value: quote.approval.reasons.join(" · ") },
      { label: "Venta original", value: `${quote.saleNumber} · hace ${daysText(quote.daysSinceSale)} (plazo ${quote.windowDays})` },
      ...quote.lines.map((l) => ({
        label: `${l.productName} · ${l.color} · T${l.size} (${l.sku}) ×${l.qty}`,
        value: `${l.condition === "DANADA" ? "dañada (merma)" : "vendible (vuelve al stock)"} · ${formatCLP(l.amount)}`,
      })),
      ...(quote.refund
        ? [{ label: "Devolver por", value: `${REFUND_METHOD_PHRASE[quote.refund.method]} · ${formatCLP(quote.refund.amount)}` }]
        : []),
      ...(quote.exchange
        ? [
            { label: "Se lleva", value: quote.exchange.newLines.map((l) => `${l.label} ×${l.qty}`).join(", ") },
            { label: "Diferencia", value: quote.exchange.toPay > 0 ? `paga ${formatCLP(quote.exchange.toPay)}` : quote.exchange.leftover > 0 ? `saldo a favor en vale ${formatCLP(quote.exchange.leftover)}` : "sin diferencia" },
          ]
        : []),
      ...(quote.resolution === "VALE" ? [{ label: "Vale a emitir", value: formatCLP(quote.voucherAmount) }] : []),
      { label: "Motivo de la clienta", value: reason },
    ],
  };

  return createApprovalRequest({
    actor: input.actor,
    type: quote.approval.type,
    locationId: data.locationId,
    amount: quote.valueReturned,
    binding: quote.binding,
    reason,
    display,
    idempotencyKey: data.idempotencyKey,
  });
}
