import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { santiagoDayKey } from "@/lib/dates";
import { formatCLP } from "@/lib/money";
import { parseInput } from "@/lib/validation";
import { createApprovalRequest } from "@/modules/approvals";
import { getDiscountLimitBps } from "./internal";
import { effectivePrice, isDiscountOverLimit, priceSale } from "./pricing";

// Solicitudes de aprobación que pide el POS (RF-AUT-01). approvals no sabe de carritos ni ventas: aquí se calcula el
// BINDING (lo que se aprueba) y el MONTO; al usar la aprobación (createSale / voidSale) se recalculan y deben coincidir.

export interface CartLineInput {
  variantId: string;
  qty: number;
  discountBps: number;
}

/**
 * Huella del carrito aprobado: SHA-256 de las líneas {variantId, qty, discountBps} ordenadas por variante. Cambiar una
 * prenda, una cantidad o un % cambia la huella y la aprobación deja de servir. (El monto del descuento, que depende de
 * los precios vigentes, se compara aparte.)
 */
export function cartBinding(lines: readonly CartLineInput[]): string {
  const canonical = [...lines]
    .map((l) => ({ v: l.variantId, q: l.qty, d: l.discountBps }))
    .sort((a, b) => (a.v < b.v ? -1 : a.v > b.v ? 1 : 0));
  return createHash("sha256").update(`cart:${JSON.stringify(canonical)}`).digest("hex");
}

/** Huella de una anulación: la venta. El monto aprobado es lo cobrado de esa venta. */
export function voidBinding(saleId: string): string {
  return createHash("sha256").update(`void:${saleId}`).digest("hex");
}

const id = z.string().trim().min(1);
const key = z.string().trim().min(8).max(200);
const reason = z.string().trim().min(3, "Escribe el motivo de la solicitud").max(300);

const discountRequestSchema = z.object({
  locationId: id,
  lines: z
    .array(z.object({ variantId: id, qty: z.number().int().positive().max(1_000), discountBps: z.number().int().min(0).max(10_000) }))
    .min(1, "El carrito está vacío")
    .max(100),
  reason,
  idempotencyKey: key,
});

/**
 * La vendedora pide a Belén aprobar los descuentos del carrito. Los montos los calcula el servidor con los precios
 * vigentes (nunca los del navegador). Solo corresponde si alguna línea supera el límite de la vendedora.
 */
export async function requestDiscountApproval(input: {
  actor: Actor;
  locationId: string;
  lines: CartLineInput[];
  reason: string;
  idempotencyKey: string;
}) {
  assertAccess(input.actor, { roles: ["VENDEDORA"], locationId: input.locationId });
  const data = parseInput(discountRequestSchema, input);

  const variantIds = [...new Set(data.lines.map((l) => l.variantId))];
  const variants = await db.productVariant.findMany({
    where: { id: { in: variantIds }, active: true, product: { active: true } },
    select: { id: true, sku: true, priceOverride: true, product: { select: { name: true, basePrice: true } }, color: { select: { name: true } }, size: { select: { code: true } } },
  });
  if (variants.length !== variantIds.length) throw new AppError("NOT_FOUND", "Una o más prendas no existen o están inactivas.");
  const byId = new Map(variants.map((v) => [v.id, v]));

  const limitBps = await getDiscountLimitBps(db);
  const over = data.lines.filter((l) => isDiscountOverLimit(l.discountBps, limitBps));
  if (over.length === 0) throw new AppError("VALIDATION", "Este carrito no tiene descuentos sobre el límite: no necesita aprobación.");

  const priced = priceSale(
    data.lines.map((l) => {
      const v = byId.get(l.variantId)!;
      return { unitPrice: effectivePrice({ priceOverride: v.priceOverride, basePrice: v.product.basePrice }), quantity: l.qty, discountBps: l.discountBps };
    }),
  );
  const display = {
    headline: `Descuento de ${formatCLP(priced.discountTotal)} en ${over.length} ${over.length === 1 ? "prenda" : "prendas"}`,
    lines: [
      ...data.lines.flatMap((l, i) => {
        if (!isDiscountOverLimit(l.discountBps, limitBps)) return [];
        const v = byId.get(l.variantId)!;
        const p = priced.lines[i];
        return [
          {
            label: `${v.product.name} · ${v.color.name} · T${v.size.code} (${v.sku}) ×${l.qty}`,
            value: `${l.discountBps / 100} % = −${formatCLP(p.discount)} sobre ${formatCLP(p.gross)}`,
          },
        ];
      }),
      { label: "Total de la venta con descuento", value: formatCLP(priced.total) },
    ],
  };

  return createApprovalRequest({
    actor: input.actor,
    type: "DESCUENTO_SOBRE_LIMITE",
    locationId: data.locationId,
    amount: priced.discountTotal,
    binding: cartBinding(data.lines),
    reason: data.reason,
    display,
    idempotencyKey: data.idempotencyKey,
  });
}

/** ¿Se puede anular esta venta? Solo POS, COMPLETADA y del mismo día calendario en hora de Chile (RN-12). */
export function assertVoidable(
  sale: { number: string; channel: string; status: string; createdAt: Date },
  now: Date = new Date(),
): void {
  if (sale.channel !== "POS") {
    throw new AppError("VALIDATION", `La venta ${sale.number} es online: se anula reembolsando el pedido cancelado, no desde Ventas del día.`);
  }
  if (sale.status !== "COMPLETADA") throw new AppError("CONFLICT", `La venta ${sale.number} ya está anulada.`);
  if (santiagoDayKey(sale.createdAt) !== santiagoDayKey(now)) {
    throw new AppError("VALIDATION", `Solo se anulan ventas del mismo día (RN-12): la venta ${sale.number} es de otro día.`);
  }
}

/** La vendedora pide a Belén anular una venta del día. El monto aprobado es lo cobrado (suma de los pagos). */
export async function requestVoidApproval(input: { actor: Actor; saleId: string; reason: string; idempotencyKey: string }) {
  assertAccess(input.actor, { roles: ["VENDEDORA"] });
  const data = parseInput(z.object({ saleId: id, reason, idempotencyKey: key }), input);
  const sale = await db.sale.findUnique({
    where: { id: data.saleId },
    include: { payments: true, lines: { include: { variant: { select: { sku: true } } } }, seller: { select: { name: true } } },
  });
  if (!sale) throw new AppError("NOT_FOUND", "La venta no existe.");
  assertAccess(input.actor, { roles: ["VENDEDORA"], locationId: sale.locationId });
  assertVoidable(sale);

  const amountPaid = sale.payments.reduce((a, p) => a + p.amount, 0);
  return createApprovalRequest({
    actor: input.actor,
    type: "ANULACION",
    locationId: sale.locationId,
    amount: amountPaid,
    binding: voidBinding(sale.id),
    reason: data.reason,
    display: {
      headline: `Anular la venta ${sale.number} · ${formatCLP(amountPaid)}`,
      lines: [
        { label: "Medio de pago", value: sale.payments.map((p) => p.method).join(" + ") },
        { label: "Vendedora de la venta", value: sale.seller.name },
        { label: "Prendas", value: sale.lines.map((l) => `${l.variant.sku} ×${l.quantity}`).join(", ") },
      ],
    },
    idempotencyKey: data.idempotencyKey,
  });
}
