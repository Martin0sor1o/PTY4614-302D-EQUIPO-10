import { db } from "@/lib/db";
import { receiveStock, reserve } from "@/modules/inventory";
import { createSale, openCashSession } from "@/modules/sales";
import { createOrderLineFixture, newKey, tx, type Fixtures, type LocationCode } from "./helpers";

// Utilidades de los tests de reportes. Las ventas se crean por los servicios reales y luego se les cambia la fecha
// (con Prisma, solo en tests) para armar historial en días y horas exactas.

export type PayMethod = "EFECTIVO" | "DEBITO" | "CREDITO" | "TRANSFERENCIA";

/** Abre la caja de Rancagua (una por tienda) para poder vender. */
export function openRgaCash(f: Fixtures) {
  return openCashSession({ actor: f.actors.vendRga, locationId: f.loc.TIENDA_RANCAGUA, openingCash: 50_000 });
}

/** Sube el stock con InventoryService (para tener unidades de sobra en los tests). */
export async function stockUp(f: Fixtures, sku: string, code: LocationCode, qty: number) {
  await receiveStock({
    actor: f.actors.belen,
    locationId: f.loc[code],
    lines: [{ variantId: await f.variant(sku), qty }],
    idempotencyKey: newKey("stock"),
  });
}

/** Aparta `qty` unidades de una ubicación para un pedido de prueba (sube `reserved`; el disponible baja). */
export async function reserveUnits(f: Fixtures, sku: string, code: LocationCode, qty: number) {
  const variantId = await f.variant(sku);
  const { orderLineId } = await createOrderLineFixture(f, variantId, f.loc[code], qty);
  await tx((t) => reserve(t, { actor: f.actors.belen, lines: [{ variantId, locationId: f.loc[code], qty, orderLineId }] }));
}

export interface TestSale {
  id: string;
  total: number;
  /** Lo cobrado: total (+ redondeo si fue efectivo). */
  amount: number;
}

/** Venta POS en Rancagua pagada con `method`, fechada en `at`. Requiere la caja abierta (`openRgaCash`). */
export async function posSale(
  f: Fixtures,
  opts: { sku: string; qty?: number; method?: PayMethod; at: Date },
): Promise<TestSale> {
  const method = opts.method ?? "DEBITO";
  const { result: sale } = await createSale({
    actor: f.actors.vendRga,
    locationId: f.loc.TIENDA_RANCAGUA,
    lines: [{ variantId: await f.variant(opts.sku), qty: opts.qty ?? 1, discountBps: 0 }],
    payment: method === "EFECTIVO" ? { method, cashReceived: 1_000_000 } : { method, reference: "REF-1" },
    idempotencyKey: newKey("venta"),
  });
  await backdateSale(sale.id, opts.at);
  return { id: sale.id, total: sale.total, amount: sale.payments.reduce((a, p) => a + p.amount, 0) };
}

/** Cambia la fecha de una venta y de sus pagos (solo tests y el seed de historial). */
export async function backdateSale(saleId: string, at: Date) {
  await db.sale.update({ where: { id: saleId }, data: { createdAt: at } });
  await db.payment.updateMany({ where: { saleId }, data: { createdAt: at } });
}

/** Fecha en hora de Chile: `santiago("2026-10-27", "23:30")`. Usa el desfase real de ese día. */
export function santiago(day: string, time = "12:00"): Date {
  // Se prueba UTC-3 y UTC-4 y se elige el que, vuelto a Chile, da la misma fecha y hora.
  for (const off of [3, 4]) {
    const d = new Date(`${day}T${time}:00.000Z`);
    d.setUTCHours(d.getUTCHours() + off);
    const back = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(d);
    if (back === `${day} ${time}`) return d;
  }
  throw new Error(`Hora inexistente en Santiago: ${day} ${time}`);
}
