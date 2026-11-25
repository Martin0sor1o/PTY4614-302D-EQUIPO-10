import { db, type Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { formatCLP } from "@/lib/money";
import { parseInput } from "@/lib/validation";
import { CashSessionStatus, PaymentMethod } from "@/generated/prisma/client";
import { emptyByMethod, getPosLocation, lockOpenCashSession, TX_OPTIONS } from "./internal";
import { cashDifference, expectedCash } from "./pricing";
import { closeCashSchema, openCashSchema } from "./schemas";
import type { CashClosingTotals, CashSessionView } from "./types";

// Caja por tienda (RF-POS-01, RF-POS-10). Una caja abierta por tienda: lo garantiza el índice único parcial
// cash_sessions_one_open_per_location_idx; la validación previa solo entrega un mensaje amable.

const ROLES = ["ADMIN", "VENDEDORA"] as const;

type Reader = Pick<Tx, "payment" | "sale" | "return" | "cashSession">;

/**
 * Totales de una caja: ventas COMPLETADAS de la sesión por medio de pago y efectivo esperado.
 * Devoluciones (ADR-021): el efectivo que sale por una devolución en dinero resta del esperado; los vales emitidos y
 * canjeados se informan aparte porque NO mueven efectivo. Lectura de solo-lectura sobre `returns` (sales no importa el
 * módulo returns: returns depende de sales).
 */
export async function cashTotals(reader: Reader, sessionId: string, openingCash: number): Promise<CashClosingTotals> {
  // Secuencial: dentro de una transacción interactiva todas las consultas comparten una sola conexión.
  const rows = await reader.payment.groupBy({
    by: ["method"],
    where: { sale: { cashSessionId: sessionId, status: "COMPLETADA" } },
    _sum: { amount: true },
  });
  const salesCount = await reader.sale.count({ where: { cashSessionId: sessionId, status: "COMPLETADA" } });
  // Una venta de otra caja (ya cerrada) anulada con ESTA caja abierta: el efectivo sale de aquí. Una venta anulada en su
  // propia caja simplemente no cuenta (no es COMPLETADA).
  const refunded = await reader.payment.aggregate({
    where: { method: PaymentMethod.EFECTIVO, sale: { voidCashSessionId: sessionId, NOT: { cashSessionId: sessionId } } },
    _sum: { amount: true },
  });
  const byMethod = emptyByMethod();
  for (const r of rows) {
    if (r.method !== PaymentMethod.VALE) byMethod[r.method] += r._sum.amount ?? 0;
  }
  const cashRefunded = refunded._sum.amount ?? 0;

  // Devoluciones en efectivo de ESTA caja (cash_session_id): el dinero que salió del cajón (ya redondeado a $10).
  const cashReturnedRow = await reader.return.aggregate({ where: { cashSessionId: sessionId }, _sum: { refundAmount: true } });
  const cashReturned = cashReturnedRow._sum.refundAmount ?? 0;

  // Informativo: vales canjeados en ventas de esta caja y vales emitidos en la tienda mientras estuvo abierta.
  const redeemed = await reader.payment.aggregate({
    where: { method: PaymentMethod.VALE, sale: { cashSessionId: sessionId, status: "COMPLETADA" } },
    _sum: { amount: true },
  });
  const session = await reader.cashSession.findUnique({ where: { id: sessionId }, select: { locationId: true, openedAt: true, closedAt: true } });
  let vouchersIssued = 0;
  if (session) {
    const window = { gte: session.openedAt, ...(session.closedAt ? { lte: session.closedAt } : {}) };
    const returns = await reader.return.findMany({
      where: { locationId: session.locationId, createdAt: window, voucherId: { not: null } },
      select: { valueReturned: true, refundMethod: true, newSaleId: true },
    });
    // Devolución a vale: se emite el valor completo. Cambio: solo queda el saldo a favor (lo demás se canjea en la misma venta).
    const exchangeSaleIds = returns.flatMap((r) => (r.newSaleId ? [r.newSaleId] : []));
    const exchangeVoucherPaid = exchangeSaleIds.length
      ? await reader.payment.findMany({ where: { saleId: { in: exchangeSaleIds }, method: PaymentMethod.VALE }, select: { saleId: true, amount: true } })
      : [];
    const paidBySale = new Map<string, number>();
    for (const p of exchangeVoucherPaid) paidBySale.set(p.saleId, (paidBySale.get(p.saleId) ?? 0) + p.amount);
    for (const r of returns) {
      vouchersIssued += r.newSaleId ? r.valueReturned - (paidBySale.get(r.newSaleId) ?? 0) : r.valueReturned;
    }
  }

  return {
    salesCount,
    byMethod,
    cashCollected: byMethod.EFECTIVO,
    cashRefunded,
    cashReturned,
    vouchersIssued,
    vouchersRedeemed: redeemed._sum.amount ?? 0,
    expectedCash: expectedCash(openingCash, [byMethod.EFECTIVO, -cashRefunded, -cashReturned]),
  };
}

const sessionInclude = { opener: { select: { name: true } }, closer: { select: { name: true } } } as const;

async function toView(
  reader: Reader,
  s: {
    id: string;
    locationId: string;
    openedAt: Date;
    openingCash: number;
    status: CashSessionStatus;
    closedAt: Date | null;
    expectedCash: number | null;
    countedCash: number | null;
    difference: number | null;
    notes: string | null;
    opener: { name: string };
    closer: { name: string } | null;
  },
): Promise<CashSessionView> {
  return {
    id: s.id,
    locationId: s.locationId,
    openedAt: s.openedAt,
    openedByName: s.opener.name,
    openingCash: s.openingCash,
    status: s.status,
    closedAt: s.closedAt,
    closedByName: s.closer?.name ?? null,
    expectedCash: s.expectedCash,
    countedCash: s.countedCash,
    difference: s.difference,
    notes: s.notes,
    salesCount: await reader.sale.count({ where: { cashSessionId: s.id, status: "COMPLETADA" } }),
  };
}

/** Caja abierta de la tienda (o null). */
export async function getOpenCashSession(actor: Actor, locationId: string): Promise<CashSessionView | null> {
  assertAccess(actor, { roles: ROLES, locationId });
  const s = await db.cashSession.findFirst({ where: { locationId, status: CashSessionStatus.ABIERTA }, include: sessionInclude });
  return s ? toView(db, s) : null;
}

/** Una caja (abierta o cerrada) de la ubicación del actor. */
export async function getCashSession(actor: Actor, sessionId: string): Promise<CashSessionView> {
  const s = await db.cashSession.findUnique({ where: { id: sessionId }, include: sessionInclude });
  if (!s) throw new AppError("NOT_FOUND", "La caja no existe.");
  assertAccess(actor, { roles: ROLES, locationId: s.locationId });
  return toView(db, s);
}

export async function getCashClosingTotals(actor: Actor, sessionId: string): Promise<CashClosingTotals> {
  const s = await getCashSession(actor, sessionId);
  return cashTotals(db, s.id, s.openingCash);
}

export async function openCashSession(input: { actor: Actor; locationId: string; openingCash: number }): Promise<CashSessionView> {
  assertAccess(input.actor, { roles: ROLES, locationId: input.locationId });
  const { locationId, openingCash } = parseInput(openCashSchema, input);
  await getPosLocation(db, locationId);

  const alreadyOpen = () => db.cashSession.findFirst({ where: { locationId, status: CashSessionStatus.ABIERTA }, select: { id: true } });
  const conflict = () => new AppError("CONFLICT", "Ya hay una caja abierta en esta tienda.");
  if (await alreadyOpen()) throw conflict();

  try {
    const s = await db.cashSession.create({
      data: { locationId, openedBy: input.actor.id, openingCash },
      include: sessionInclude,
    });
    return toView(db, s);
  } catch (error) {
    // Dos aperturas simultáneas: la segunda choca con el índice único parcial.
    if (await alreadyOpen()) throw conflict();
    throw error;
  }
}

/**
 * Cierre de caja. Bloquea la fila de la sesión (FOR UPDATE): espera a las ventas en curso (que la tienen con
 * FOR SHARE) y las que lleguen después ya no encuentran caja abierta. Luego calcula lo esperado sobre datos
 * confirmados. Con diferencia ≠ 0 la observación es obligatoria (decisión de demo; pendiente con el cliente).
 */
export async function closeCashSession(input: {
  actor: Actor;
  locationId: string;
  countedCash: number;
  notes?: string;
}): Promise<CashSessionView> {
  assertAccess(input.actor, { roles: ROLES, locationId: input.locationId });
  const { locationId, countedCash, notes } = parseInput(closeCashSchema, input);

  return db.$transaction(async (tx) => {
    const locked = await lockOpenCashSession(tx, locationId, "update");
    if (!locked) throw new AppError("CONFLICT", "No hay una caja abierta en esta tienda.");

    const totals = await cashTotals(tx, locked.id, locked.openingCash);
    const difference = cashDifference(countedCash, totals.expectedCash);
    if (difference !== 0 && !notes) {
      throw new AppError(
        "VALIDATION",
        `La caja tiene una diferencia de ${formatCLP(difference)}. Escribe una observación para poder cerrarla.`,
        { needsNotes: true, difference, expectedCash: totals.expectedCash },
      );
    }

    const closed = await tx.cashSession.update({
      where: { id: locked.id },
      data: {
        status: CashSessionStatus.CERRADA,
        closedBy: input.actor.id,
        closedAt: new Date(),
        expectedCash: totals.expectedCash,
        countedCash,
        difference,
        notes: notes ?? null,
      },
      include: sessionInclude,
    });
    if (difference !== 0) {
      await tx.auditLog.create({
        data: {
          userId: input.actor.id,
          locationId,
          action: "CASH_CLOSE_WITH_DIFFERENCE",
          entity: "cash_session",
          entityId: locked.id,
          after: { expectedCash: totals.expectedCash, countedCash, difference, notes: notes ?? null },
        },
      });
    }
    return toView(tx, closed);
  }, TX_OPTIONS);
}
