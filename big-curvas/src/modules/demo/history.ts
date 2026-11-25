import { db } from "@/lib/db";
import type { Actor } from "@/lib/access";
import { isDemoMode } from "@/lib/demo";
import { AppError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import {
  cancelOrder,
  confirmPayment,
  dispatchOrder,
  markDelivered,
  prepareOrder,
  refundOrder,
  registerOrder,
} from "@/modules/orders";
import { approveRequest } from "@/modules/approvals";
import { createReturn, requestReturnApproval } from "@/modules/returns";
import { closeCashSession, createSale, getCashClosingTotals, openCashSession, voidSale, type CreateSaleInput } from "@/modules/sales";
import type { HistoryOrder, HistoryPlan, HistoryPosSale } from "./history-plan";
import { PRODUCTS } from "./seed-data";

// DEMO: ejecuta el plan del historial (Etapa 6.5) por los SERVICIOS REALES (sales, orders): el stock solo se mueve vía
// InventoryService, con sus reglas, movimientos y correlativos. Solo corre desde el seed/reinicio con DEMO_MODE
// (`resetAndSeedDemoData({ history: true })`); no se exporta a rutas ni a acciones.
//
// Fechas simuladas: los servicios usan el reloj real, así que las operaciones se ejecutan "ahora" y al final se corrigen
// las fechas con `update` de Prisma (sin SQL crudo) sobre ventas, pagos, cajas, pedidos y su historial. Los movimientos
// de stock y el historial de estados de los pedidos son inmutables (trigger) y conservan la fecha del seed.
//
// Caja secuencial por día: abrir → vender → anular (antes de cerrar) → cerrar. Nunca hay dos abiertas a la vez.

const NAMES = ["Camila Soto", "Daniela Rojas", "Francisca Muñoz", "Javiera Pizarro", "Constanza Vera", "Paula Contreras", "Marcela Díaz", "Andrea Fuentes", "Carolina Silva", "Valentina Araya"];
const COMMUNES = ["Rancagua", "Machalí", "San Fernando", "Santiago", "Talca", "Curicó"];

export interface HistorySummary {
  days: number;
  posSales: number;
  voidedSales: number;
  orders: number;
  pendingRefunds: number;
  /** Devoluciones y cambios del escenario de la demo (ADR-021). */
  returns: number;
  exchanges: number;
}

type Fixup = Prisma.PrismaPromise<unknown>;

function actorOf(u: { id: string; role: Actor["role"]; location: { id: string; code: string; name: string; type: "STORE" | "WAREHOUSE" } | null }): Actor {
  return { id: u.id, role: u.role, location: u.location };
}

/** Lo que la clienta entrega en efectivo: el siguiente múltiplo de $1.000 sobre el total (alcanza siempre), con enteros. */
const cashHandedOver = (total: number) => Math.floor(total / 1000) * 1000 + 1000;

const PRICE_BY_SKU = new Map<string, number>(
  PRODUCTS.flatMap((p) => p.colors.flatMap((c) => p.sizes.map((s) => [`${p.model}-${c}-${s}`, p.price] as const))),
);

export async function runDemoHistory(plan: HistoryPlan): Promise<HistorySummary> {
  if (!isDemoMode()) throw new AppError("FORBIDDEN", "El historial de demo solo se carga con DEMO_MODE=true.");

  const users = await db.user.findMany({ where: { email: { in: ["belen@bigcurvas.demo", "rancagua@bigcurvas.demo", "rancagua2@bigcurvas.demo"] } }, include: { location: true } });
  const user = (email: string) => actorOf(users.find((u) => u.email === email)!);
  const belen = user("belen@bigcurvas.demo");
  const sellers = { "vend-rga": user("rancagua@bigcurvas.demo"), "vend-rga-2": user("rancagua2@bigcurvas.demo") };
  const store = await db.location.findUniqueOrThrow({ where: { code: "TIENDA_RANCAGUA" } });
  const variantIdBySku = new Map((await db.productVariant.findMany({ select: { id: true, sku: true } })).map((v) => [v.sku, v.id]));
  const variantId = (sku: string) => variantIdBySku.get(sku) ?? ((): never => { throw new Error(`Historial: la variante ${sku} no existe`); })();

  const fixups: Fixup[] = [];
  let pendingRefunds = 0;
  let returnsDone = 0;
  let exchangesDone = 0;
  // El escenario de devoluciones corre en la caja del 4.º día con ventas contando desde hoy (siempre dentro del plazo de 30 días).
  const returnsDay = plan.days.length > 0 ? plan.days[Math.max(0, plan.days.length - 4)].dayKey : null;

  // Pedidos agrupados por día de pago: se ejecutan junto con el día, en orden cronológico.
  const ordersByDay = new Map<string, HistoryOrder[]>();
  for (const o of plan.orders) ordersByDay.set(o.payDay, [...(ordersByDay.get(o.payDay) ?? []), o]);

  for (const day of plan.days) {
    // ── Caja del día: abrir ──
    const opener = sellers["vend-rga"];
    const session = await openCashSession({ actor: opener, locationId: store.id, openingCash: 50_000 });

    for (const s of day.sales) await runPosSale(s);
    if (day.dayKey === returnsDay) await runReturnsScenario(day);

    // ── Cerrar: la vendedora cuenta exactamente lo esperado (el sistema lo calcula) ──
    const totals = await getCashClosingTotals(opener, session.id);
    await closeCashSession({ actor: opener, locationId: store.id, countedCash: totals.expectedCash });
    fixups.push(db.cashSession.update({ where: { id: session.id }, data: { openedAt: day.openAt, closedAt: day.closeAt } }));

    for (const o of ordersByDay.get(day.dayKey) ?? []) await runOrder(o);
  }

  /**
   * Devolución en efectivo (pedida por la vendedora y aprobada por Belén), devolución a vale (vale vigente con código fijo de
   * demo) y cambio con diferencia a pagar. Todo por los servicios reales; las fechas se llevan a la mañana del día simulado.
   */
  async function runReturnsScenario(day: HistoryPlan["days"][number]) {
    const seller = sellers["vend-rga"];
    const at = (minutes: number) => new Date(day.openAt.getTime() + minutes * 60_000);
    const sell = async (tag: string, sku: string, qty: number, method: "EFECTIVO" | "DEBITO", minute: number) => {
      const { result } = await createSale({
        actor: seller,
        locationId: store.id,
        lines: [{ variantId: variantId(sku), qty, discountBps: 0 }],
        payment: method === "EFECTIVO" ? { method, cashReceived: cashHandedOver((PRICE_BY_SKU.get(sku) ?? 0) * qty) } : { method, reference: `V-R-${tag}` },
        idempotencyKey: `seed-hist-ret-${tag}-venta`,
      });
      fixups.push(db.sale.update({ where: { id: result.id }, data: { createdAt: at(minute) } }));
      fixups.push(db.payment.updateMany({ where: { saleId: result.id }, data: { createdAt: at(minute) } }));
      const line = await db.saleLine.findFirstOrThrow({ where: { saleId: result.id, variantId: variantId(sku) } });
      return { saleId: result.id, saleLineId: line.id };
    };
    const stamp = (returnId: string, minute: number) => fixups.push(db.return.update({ where: { id: returnId }, data: { createdAt: at(minute) } }));

    // a) Devolución en efectivo: la vendedora la pide, Belén la aprueba y el efectivo sale de la caja abierta.
    const a = await sell("a", "PBA041-NEG-XL", 1, "EFECTIVO", 5);
    const aLines = [{ saleLineId: a.saleLineId, qty: 1, condition: "VENDIBLE" as const }];
    const aResolution = { kind: "DINERO" as const, method: "EFECTIVO" as const };
    const { result: aRequest } = await requestReturnApproval({
      actor: seller,
      locationId: store.id,
      saleId: a.saleId,
      lines: aLines,
      resolution: aResolution,
      reason: "FALLA",
      reasonNote: "Costura abierta",
      idempotencyKey: "seed-hist-ret-a-solicitud",
    });
    await approveRequest({ actor: belen, requestId: aRequest.id, idempotencyKey: "seed-hist-ret-a-aprobar" });
    const { result: aReturn } = await createReturn({
      actor: seller,
      locationId: store.id,
      saleId: a.saleId,
      lines: aLines,
      reason: "FALLA",
      reasonNote: "Costura abierta",
      resolution: aResolution,
      approvalId: aRequest.id,
      idempotencyKey: "seed-hist-ret-a",
    });
    stamp(aReturn.id, 8);

    // b) Devolución a vale: queda un vale VIGENTE con código fijo de demo (la vendedora lo entrega sin aprobación: bajo el tope).
    const b = await sell("b", "PBA041-NEG-XL", 2, "DEBITO", 12);
    const { result: bReturn } = await createReturn({
      actor: seller,
      locationId: store.id,
      saleId: b.saleId,
      lines: [{ saleLineId: b.saleLineId, qty: 1, condition: "VENDIBLE" }],
      reason: "TALLA",
      resolution: { kind: "VALE" },
      idempotencyKey: "seed-hist-ret-b",
      demoVoucherCode: "VAL-DEMO-VALE-0001",
    });
    stamp(bReturn.id, 15);
    if (bReturn.voucher) fixups.push(db.voucher.update({ where: { id: bReturn.voucher.id }, data: { createdAt: at(15) } }));

    // c) Cambio con diferencia a pagar: devuelve una polera de $8.990 y se lleva una de $10.990 (paga $2.000 con tarjeta).
    const c = await sell("c", "PBA041-NEG-XL", 1, "DEBITO", 20);
    const { result: cReturn } = await createReturn({
      actor: seller,
      locationId: store.id,
      saleId: c.saleId,
      lines: [{ saleLineId: c.saleLineId, qty: 1, condition: "VENDIBLE" }],
      reason: "NO_ES_LO_ESPERADO",
      resolution: { kind: "CAMBIO", newLines: [{ variantId: variantId("POV042-BLA-XL"), qty: 1 }], payment: { method: "DEBITO", reference: "V-R-cambio" } },
      idempotencyKey: "seed-hist-ret-c",
    });
    stamp(cReturn.id, 24);
    if (cReturn.newSale) {
      fixups.push(db.sale.update({ where: { id: cReturn.newSale.id }, data: { createdAt: at(24) } }));
      fixups.push(db.payment.updateMany({ where: { saleId: cReturn.newSale.id }, data: { createdAt: at(24) } }));
    }
    if (cReturn.voucher) fixups.push(db.voucher.update({ where: { id: cReturn.voucher.id }, data: { createdAt: at(24) } }));
    returnsDone += 3;
    exchangesDone += 1;
  }

  async function runPosSale(s: HistoryPosSale) {
    const input: CreateSaleInput = {
      actor: sellers[s.seller],
      locationId: store.id,
      lines: s.lines.map((l) => ({ variantId: variantId(l.sku), qty: l.qty, discountBps: 0 })),
      payment:
        s.method === "EFECTIVO"
          ? { method: "EFECTIVO", cashReceived: cashHandedOver(s.lines.reduce((a, l) => a + (PRICE_BY_SKU.get(l.sku) ?? 0) * l.qty, 0)) }
          : { method: s.method, reference: `V-${1000 + s.index}` },
      idempotencyKey: `seed-hist-pos-${s.index}`,
    };
    const { result: sale } = await createSale(input);
    let voidedAt: Date | undefined;
    if (s.voided) {
      // Belén anula ANTES de que la venta tome su fecha simulada (RN-12: solo ventas del mismo día) y antes de cerrar la caja.
      await voidSale({ actor: belen, saleId: sale.id, reason: "Error de digitación al cobrar", idempotencyKey: `seed-hist-void-${s.index}` });
      voidedAt = new Date(s.at.getTime() + 8 * 60_000);
    }
    fixups.push(db.sale.update({ where: { id: sale.id }, data: { createdAt: s.at, ...(voidedAt ? { voidedAt } : {}) } }));
    fixups.push(db.payment.updateMany({ where: { saleId: sale.id }, data: { createdAt: s.at } }));
  }

  async function runOrder(o: HistoryOrder) {
    const key = (step: string) => `seed-hist-ord-${o.n}-${step}`;
    const customer = NAMES[o.n % NAMES.length];
    const { result: registered } = await registerOrder({
      actor: belen,
      channel: o.n % 3 === 0 ? "WHATSAPP" : "INSTAGRAM",
      newCustomer: {
        name: customer,
        instagramHandle: `@${customer.toLowerCase().replaceAll(" ", ".")}`,
        phone: `+5699${String(1000000 + o.n * 7919).slice(0, 7)}`,
        address: `Calle Ejemplo ${100 + o.n}`,
        commune: COMMUNES[o.n % COMMUNES.length],
      },
      lines: o.lines.map((l) => ({ variantId: variantId(l.sku), qty: l.qty, discountBps: 0 })),
      shippingCost: o.shipping,
      shippingAddress: `Calle Ejemplo ${100 + o.n}, ${COMMUNES[o.n % COMMUNES.length]}`,
      idempotencyKey: key("reg"),
    });
    await confirmPayment({
      actor: belen,
      orderId: registered.id,
      payment: { method: o.method, reference: o.method === "TRANSFERENCIA" ? `TRF-${5000 + o.n}` : `V-${7000 + o.n}` },
      lineSources: [],
      idempotencyKey: key("pay"),
    });

    // Etapas según el plan (solo las que ya ocurrieron): entrega, o cancelación (con o sin reembolso).
    if (o.prepareAt) {
      await prepareOrder({ actor: belen, orderId: registered.id, scanned: o.lines.map((l) => ({ variantId: variantId(l.sku), qty: l.qty })), idempotencyKey: key("prep") });
    }
    if (o.dispatchAt) {
      await dispatchOrder({ actor: belen, orderId: registered.id, courier: ["Starken", "Blue Express", "Chilexpress"][o.n % 3], trackingNumber: `TRK-${900000 + o.n}`, idempotencyKey: key("disp") });
    }
    if (o.deliverAt) await markDelivered({ actor: belen, orderId: registered.id, idempotencyKey: key("deliv") });
    if (o.cancelAt) {
      await cancelOrder({ actor: belen, orderId: registered.id, reason: o.outcome === "CANCELADO_PENDIENTE" ? "La clienta ya no quiere esperar" : "Se equivocó de talla", idempotencyKey: key("cancel") });
      if (o.refundAt) await refundOrder({ actor: belen, orderId: registered.id, method: "Transferencia", reference: `REEMB-${o.n}`, idempotencyKey: key("refund") });
      else pendingRefunds++;
    }

    // ── Fechas simuladas ──
    const createdAt = new Date(o.paidAt.getTime() - 25 * 60_000);
    fixups.push(
      db.onlineOrder.update({
        where: { id: registered.id },
        data: {
          createdAt,
          paidAt: o.paidAt,
          ...(o.prepareAt ? { preparedAt: o.prepareAt } : {}),
          ...(o.dispatchAt ? { shippedAt: o.dispatchAt } : {}),
          ...(o.deliverAt ? { deliveredAt: o.deliverAt } : {}),
          ...(o.cancelAt ? { cancelledAt: o.cancelAt } : {}),
          ...(o.refundAt ? { refundedAt: o.refundAt } : {}),
        },
      }),
    );
    fixups.push(
      db.sale.update({
        where: { onlineOrderId: registered.id },
        data: { createdAt: o.paidAt, ...(o.refundAt ? { voidedAt: o.refundAt } : {}) },
      }),
    );
    fixups.push(db.payment.updateMany({ where: { sale: { onlineOrderId: registered.id } }, data: { createdAt: o.paidAt } }));
    // El historial de estados (online_order_events) es solo-INSERT por trigger: conserva la fecha del seed.
  }

  // Todas las fechas simuladas de una vez, en lotes (una transacción por lote).
  for (let i = 0; i < fixups.length; i += 250) await db.$transaction(fixups.slice(i, i + 250));

  return {
    days: plan.days.length,
    posSales: plan.posSales,
    voidedSales: plan.voidedSales,
    orders: plan.orders.length,
    pendingRefunds,
    returns: returnsDone,
    exchanges: exchangesDone,
  };
}
