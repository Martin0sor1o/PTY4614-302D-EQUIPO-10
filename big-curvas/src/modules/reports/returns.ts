import { db } from "@/lib/db";
import type { Actor } from "@/lib/access";
import { parseInput } from "@/lib/validation";
import { assertReportsAccess, windowOfDays } from "./internal";
import { rangeSchema } from "./schemas";
import type { ReturnsReport, ReturnsReportRow } from "./types";

// Reporte de devoluciones y cambios (ADR-021, RF-DEV): por motivo, por ubicación y por destino. SOLO LECTURA, solo ADMIN.
//
// Definiciones (a validar con Belén, P-24):
//  · Cuenta las devoluciones y cambios hechos en el rango (fecha de la devolución, días de Chile), de cualquier ubicación.
//  · "Valor devuelto" = lo pagado por las prendas devueltas (con el descuento de su línea; sin envío).
//  · Destino: dinero (efectivo, transferencia o anulación en la máquina), vale (devolución a vale) o cambio.
//  · "Dañadas" = unidades que entraron y salieron como merma.
//  · Ventas netas = lo cobrado por las ventas del rango (todos los medios, vales incluidos, como el reporte de ventas) menos
//    el valor devuelto en el mismo rango: una devolución resta aunque la venta original sea de otro día.

const MONEY = new Set(["EFECTIVO", "TRANSFERENCIA", "ANULACION_TRANSBANK"]);

const empty = (key: string, label: string): ReturnsReportRow => ({ key, label, returns: 0, units: 0, value: 0, damagedUnits: 0 });

function add(row: ReturnsReportRow, units: number, value: number, damagedUnits: number) {
  row.returns += 1;
  row.units += units;
  row.value += value;
  row.damagedUnits += damagedUnits;
}

export async function getReturnsReport(input: { actor: Actor; from: string; to: string }): Promise<ReturnsReport> {
  assertReportsAccess(input.actor);
  const { from, to } = parseInput(rangeSchema, { from: input.from, to: input.to });
  const createdAt = windowOfDays(from, to);

  // Consultas secuenciales y simples: el volumen de una tienda chica no justifica un SQL más complejo.
  const returns = await db.return.findMany({
    where: { createdAt },
    select: { id: true, type: true, reason: true, locationId: true, refundMethod: true, valueReturned: true, refundAmount: true },
  });
  const lines = returns.length
    ? await db.returnLine.findMany({ where: { returnId: { in: returns.map((r) => r.id) } }, select: { returnId: true, quantity: true, condition: true } })
    : [];
  const locations = await db.location.findMany({ select: { id: true, name: true } });
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const paid = await db.payment.aggregate({ where: { sale: { status: "COMPLETADA", createdAt } }, _sum: { amount: true } });

  const unitsOf = new Map<string, { units: number; damaged: number }>();
  for (const l of lines) {
    const u = unitsOf.get(l.returnId) ?? { units: 0, damaged: 0 };
    u.units += l.quantity;
    if (l.condition === "DANADA") u.damaged += l.quantity;
    unitsOf.set(l.returnId, u);
  }

  const byReason = new Map<string, ReturnsReportRow>();
  const byLocation = new Map<string, ReturnsReportRow>();
  const byDestination = new Map<string, ReturnsReportRow>([
    ["DINERO", empty("DINERO", "Reembolso en dinero")],
    ["VALE", empty("VALE", "Vale")],
    ["CAMBIO", empty("CAMBIO", "Cambio")],
  ]);
  const total = empty("total", "Total");
  let refundedMoney = 0;

  for (const r of returns) {
    const u = unitsOf.get(r.id) ?? { units: 0, damaged: 0 };
    const destination = r.type === "CAMBIO" ? "CAMBIO" : MONEY.has(r.refundMethod) ? "DINERO" : "VALE";
    const targets = [
      byReason.get(r.reason) ?? byReason.set(r.reason, empty(r.reason, r.reason)).get(r.reason)!,
      byLocation.get(r.locationId) ?? byLocation.set(r.locationId, empty(r.locationId, locationName.get(r.locationId) ?? "Ubicación")).get(r.locationId)!,
      byDestination.get(destination)!,
      total,
    ];
    for (const t of targets) add(t, u.units, r.valueReturned, u.damaged);
    refundedMoney += r.refundAmount;
  }

  const byValueDesc = (a: ReturnsReportRow, b: ReturnsReportRow) => b.value - a.value || a.label.localeCompare(b.label, "es");
  const grossSales = paid._sum.amount ?? 0;
  return {
    from,
    to,
    totalReturns: total.returns,
    totalUnits: total.units,
    damagedUnits: total.damagedUnits,
    valueReturned: total.value,
    refundedMoney,
    grossSales,
    netSales: grossSales - total.value,
    byReason: [...byReason.values()].sort(byValueDesc),
    byLocation: [...byLocation.values()].sort(byValueDesc),
    byDestination: [...byDestination.values()],
  };
}
