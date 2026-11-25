import { randomUUID } from "node:crypto";
import { db, type Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { runIdempotent, type IdempotentResult } from "@/lib/idempotency";
import { parseInput } from "@/lib/validation";
import { consumeApproval } from "@/modules/approvals";
import { lockStock, returnToStock, writeOff } from "@/modules/inventory";
import { nextDocumentNumber } from "@/modules/numbering";
import { createSaleInTx, lockOpenCashSessionInTx } from "@/modules/sales";
import { issueVoucher, type IssuedVoucher } from "@/modules/vouchers";
import { loadSaleForReturn, lockSaleForReturn, priceNewLines, TX_OPTIONS } from "./internal";
import { getReturnPolicy } from "./policy";
import { buildQuote, mergeLines } from "./quote";
import { loadReturnView } from "./queries";
import { createReturnSchema, type ReturnLineInput, type ReturnResolutionInput } from "./schemas";
import type { ReturnView } from "./types";

export interface CreateReturnInput {
  actor: Actor;
  locationId: string;
  saleId: string;
  lines: ReturnLineInput[];
  reason: "TALLA" | "FALLA" | "NO_ES_LO_ESPERADO" | "ARREPENTIMIENTO" | "OTRO";
  reasonNote?: string;
  resolution: ReturnResolutionInput;
  /** Aprobación de Belén (APROBADA, de un solo uso) cuando una VENDEDORA hace algo fuera de regla (S-01, S-06, S-08). */
  approvalId?: string;
  idempotencyKey: string;
}

/**
 * CAMBIO o DEVOLUCIÓN (ADR-021, RF-DEV-01 a 07). Una sola transacción, idempotente por `idempotencyKey`:
 *   1. Venta elegible (S-02) y plazo (S-01). Caja abierta si hay efectivo o cambio (sin caja → CONFLICT).
 *   2. `lockStock` (orden canónico) y guardia anti sobre-devolución con UPDATE condicional por línea: dos devoluciones
 *      simultáneas de la misma línea → gana una, la otra CONFLICT.
 *   3. Aprobación: VENDEDORA fuera de regla → `consumeApproval` (uso único, ligada a venta + prendas + destino + monto);
 *      ADMIN directo, sin solicitud (regla 10b), y queda en audit_log.
 *   4. Stock solo vía InventoryService: `returnToStock` (DEVOLUCION) y, si está dañada, `writeOff` (MERMA).
 *   5. Destino: vale (`issueVoucher`), dinero (efectivo sale de la caja abierta, redondeado a $10) o cambio (vale temporal
 *      que se canjea al instante en la venta nueva; lo que sobra queda en el vale).
 */
export async function createReturn(input: CreateReturnInput): Promise<IdempotentResult<ReturnView>> {
  assertAccess(input.actor, { roles: ["ADMIN", "VENDEDORA"], locationId: input.locationId });
  const data = parseInput(createReturnSchema, input);

  return runIdempotent({
    find: async () => {
      const existing = await db.return.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        select: { id: true, locationId: true, originalSaleId: true },
      });
      if (!existing) return null;
      if (existing.locationId !== data.locationId || existing.originalSaleId !== data.saleId) {
        throw new AppError("CONFLICT", "Esa clave de operación ya fue usada en otra devolución.");
      }
      return loadReturnView(db, existing.id);
    },
    execute: async () => {
      const returnId = await db.$transaction((tx) => executeReturn(tx, input.actor, data), TX_OPTIONS);
      return loadReturnView(db, returnId);
    },
  });
}

async function executeReturn(tx: Tx, actor: Actor, data: ReturnType<typeof createReturnSchema.parse>): Promise<string> {
  const { locationId, resolution, idempotencyKey } = data;
  // 0. Orden de bloqueo: VENTA → caja → stock. La venta va primero (FOR SHARE) y su estado se vuelve a validar DESPUÉS: una
  //    anulación simultánea de la misma venta la toma FOR UPDATE, así que una de las dos espera y la otra falla limpio.
  await lockSaleForReturn(tx, data.saleId);
  const location = await tx.location.findFirst({ where: { id: locationId, active: true }, select: { id: true, name: true, sellsPos: true } });
  if (!location) throw new AppError("NOT_FOUND", "La ubicación no existe o está inactiva.", { locationId });

  const sale = await loadSaleForReturn(tx, data.saleId);
  const policy = await getReturnPolicy(tx);
  const lines = mergeLines(sale, data.lines);
  const returnId = randomUUID();
  const isAdmin = actor.role === "ADMIN";

  // 1. Caja: el reembolso en efectivo sale de la caja ABIERTA y un cambio vende desde ella. Sin caja abierta se bloquea.
  //    (En la bodega no hay caja: buildQuote rechaza el efectivo y el cambio con su mensaje.)
  const needsCash = resolution.kind === "DINERO" && resolution.method === "EFECTIVO";
  let cashSessionId: string | null = null;
  if ((needsCash || resolution.kind === "CAMBIO") && location.sellsPos) {
    const session = await lockOpenCashSessionInTx(tx, locationId, "share");
    if (!session) {
      throw new AppError("CONFLICT", `No hay caja abierta en ${location.name}. Abre la caja para ${needsCash ? "devolver en efectivo" : "hacer un cambio"}.`);
    }
    if (needsCash) cashSessionId = session.id;
  }

  // 2. Bloqueo de stock en orden canónico (lo que entra y lo que sale) y guardia anti sobre-devolución.
  const priced = resolution.kind === "CAMBIO" ? await priceNewLines(tx, resolution.newLines) : null;
  const keys = [
    ...lines.map((l) => ({ locationId, variantId: sale.lineByid.get(l.saleLineId)!.variantId })),
    ...(resolution.kind === "CAMBIO" ? resolution.newLines.map((l) => ({ locationId, variantId: l.variantId })) : []),
  ];
  await lockStock(tx, { actor, keys });

  const before = new Map<string, number>();
  for (const l of [...lines].sort((a, b) => (a.saleLineId < b.saleLineId ? -1 : a.saleLineId > b.saleLineId ? 1 : 0))) {
    const rows = await tx.$queryRaw<{ before: number }[]>`
      UPDATE sale_lines SET returned_quantity = returned_quantity + ${l.qty}
      WHERE id = ${l.saleLineId} AND sale_id = ${sale.id} AND returned_quantity + ${l.qty} <= quantity
      RETURNING returned_quantity - ${l.qty} AS before`;
    if (!rows[0]) {
      const current = await tx.saleLine.findUnique({ where: { id: l.saleLineId }, select: { quantity: true, returnedQuantity: true } });
      const sl = sale.lineByid.get(l.saleLineId)!;
      const sold = current?.quantity ?? sl.soldQty;
      const returned = current?.returnedQuantity ?? sl.returnedQty;
      const available = Math.max(0, sold - returned);
      // Mismo mensaje que la cotización, pero con las cantidades de AHORA (otra devolución pudo ganar la carrera).
      throw new AppError(
        "CONFLICT",
        available === 0
          ? `${sl.sku} ya se devolvió completo (vendidas ${sold}, devueltas ${returned}).`
          : `De ${sl.sku} solo se pueden devolver ${available} más (vendidas ${sold}, devueltas ${returned}).`,
        { saleLineId: l.saleLineId, sold, returned, available },
      );
    }
    before.set(l.saleLineId, rows[0].before);
  }

  // 3. Cotización definitiva con las cantidades ya confirmadas por el UPDATE (los montos salen de aquí).
  const quote = buildQuote({ sale, location, actorRole: actor.role, policy, lines, resolution, priced, returnedBefore: before, cashOpen: true });

  // 4. Aprobación (VENDEDORA fuera de regla): uso único, mismo tipo, ubicación, monto y huella. Si la operación falla después,
  //    la transacción se revierte y la aprobación sigue disponible.
  let usedApprovalId: string | null = null;
  if (!isAdmin && quote.approval.required) {
    if (!data.approvalId) {
      throw new AppError("APROBACION_REQUERIDA", `Esta devolución requiere la aprobación de Belén: ${quote.approval.reasons.join("; ")}.`, {
        approvalType: quote.approval.type,
        reasons: quote.approval.reasons,
      });
    }
    await consumeApproval(tx, {
      actor,
      approvalId: data.approvalId,
      type: quote.approval.type!,
      locationId,
      amount: quote.valueReturned,
      binding: quote.binding,
      usedRefType: "RETURN",
      usedRefId: returnId,
    });
    usedApprovalId = data.approvalId;
  }

  // 5. Stock, solo vía InventoryService. La prenda dañada entra y sale como merma (stock neto 0, historia completa).
  await returnToStock(tx, {
    actor,
    locationId,
    lines: quote.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
    returnId,
    reason: `Devolución de la venta ${sale.number}`,
    idempotencyKey: `${idempotencyKey}:dev`,
  });
  const damaged = quote.lines.filter((l) => l.condition === "DANADA");
  if (damaged.length > 0) {
    await writeOff(tx, {
      actor,
      locationId,
      lines: damaged.map((l) => ({ variantId: l.variantId, qty: l.qty })),
      returnId,
      reason: `Prenda devuelta en mal estado (venta ${sale.number})`,
      idempotencyKey: `${idempotencyKey}:merma`,
    });
  }

  const number = await nextDocumentNumber(tx, "RETURN", "DEV");

  // 6. Destino del valor devuelto.
  let voucher: IssuedVoucher | null = null;
  let newSaleId: string | null = null;
  if (resolution.kind === "VALE") {
    voucher = await issueVoucher(tx, { actor, locationId, amount: quote.valueReturned, returnId, idempotencyKey });
  } else if (resolution.kind === "CAMBIO") {
    // S-05: el valor devuelto se vuelve un vale que se canjea al instante en la venta nueva; el saldo a favor queda en el vale.
    voucher = await issueVoucher(tx, { actor, locationId, amount: quote.valueReturned, returnId, idempotencyKey });
    const exchange = await createSaleInTx(tx, actor, {
      locationId,
      lines: resolution.newLines.map((l) => ({ variantId: l.variantId, qty: l.qty, discountBps: 0 })),
      payment: resolution.payment,
      voucher: { id: voucher.id },
      idempotencyKey: `${idempotencyKey}:venta`,
    });
    newSaleId = exchange.saleId;
  }

  await tx.return.create({
    data: {
      id: returnId,
      number,
      locationId,
      originalSaleId: sale.id,
      type: resolution.kind === "CAMBIO" ? "CAMBIO" : "DEVOLUCION",
      reason: data.reason,
      reasonNote: data.reasonNote ?? null,
      valueReturned: quote.valueReturned,
      refundMethod: resolution.kind === "DINERO" ? resolution.method : resolution.kind === "VALE" ? "VALE" : "NINGUNO",
      refundAmount: quote.refund?.amount ?? 0,
      roundingAdjustment: quote.refund?.roundingAdjustment ?? 0,
      refundReference: resolution.kind === "DINERO" && resolution.method !== "EFECTIVO" ? (resolution.reference?.trim() ?? null) : null,
      approvalId: usedApprovalId,
      cashSessionId,
      voucherId: voucher?.id ?? null,
      newSaleId,
      userId: actor.id,
      idempotencyKey,
    },
  });
  await tx.returnLine.createMany({
    data: quote.lines.map((l) => ({
      returnId,
      saleLineId: l.saleLineId,
      variantId: l.variantId,
      quantity: l.qty,
      amount: l.amount,
      condition: l.condition,
    })),
  });

  await tx.auditLog.create({
    data: {
      userId: actor.id,
      locationId,
      action: "RETURN_CREATE",
      entity: "return",
      entityId: returnId,
      after: {
        number,
        saleNumber: sale.number,
        type: resolution.kind === "CAMBIO" ? "CAMBIO" : "DEVOLUCION",
        reason: data.reason,
        valueReturned: quote.valueReturned,
        destination: resolution.kind,
        refundMethod: resolution.kind === "DINERO" ? resolution.method : null,
        refundAmount: quote.refund?.amount ?? 0,
        voucherId: voucher?.id ?? null,
        newSaleId,
        outOfWindow: quote.outOfWindow,
        approvalId: usedApprovalId,
        // Directa del ADMIN (sin solicitud) o con aprobación de Belén pedida por una vendedora (regla 10b).
        direct: isAdmin,
        lines: quote.lines.map((l) => ({ sku: l.sku, qty: l.qty, condition: l.condition, amount: l.amount })),
      },
    },
  });
  return returnId;
}
