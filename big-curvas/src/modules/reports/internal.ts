import { db } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { addDaysToKey, santiagoDayKey, startOfDayKeySantiago } from "@/lib/dates";
import type { Prisma } from "@/generated/prisma/client";

// Utilidades de los reportes. Este módulo es de SOLO LECTURA (CLAUDE.md regla 1): nada de aquí escribe en la BD.

/** Los reportes los ve solo Belén (ADMIN). Cada consulta pública lo valida en el servidor (regla 10). */
export function assertReportsAccess(actor: Actor): void {
  assertAccess(actor, { roles: ["ADMIN"] });
}

export const SETTING_LOW_STOCK = "low_stock_threshold";
export const SETTING_NO_ROTATION_DAYS = "no_rotation_days";
export const SETTING_FRIDAY_DAYS = "friday_list_days";

export const DEFAULT_LOW_STOCK = 2;
export const DEFAULT_NO_ROTATION_DAYS = 60;
export const DEFAULT_FRIDAY_DAYS = 14;

/** Entero positivo desde `settings`; si falta o es inválido, el valor propuesto de la demo. */
export async function readPositiveIntSetting(key: string, fallback: number): Promise<number> {
  const row = await db.setting.findUnique({ where: { key }, select: { valueInt: true } });
  const v = row?.valueInt;
  return v !== null && v !== undefined && Number.isInteger(v) && v > 0 ? v : fallback;
}

/** Entero ≥ 0 (el umbral de stock bajo puede ser 0). */
export async function readNonNegativeIntSetting(key: string, fallback: number): Promise<number> {
  const row = await db.setting.findUnique({ where: { key }, select: { valueInt: true } });
  const v = row?.valueInt;
  return v !== null && v !== undefined && Number.isInteger(v) && v >= 0 ? v : fallback;
}

/** Instantes UTC [desde, hasta) de un rango de días calendario de Chile (ambos extremos incluidos). */
export function windowOfDays(fromKey: string, toKey: string): { gte: Date; lt: Date } {
  return { gte: startOfDayKeySantiago(fromKey), lt: startOfDayKeySantiago(addDaysToKey(toKey, 1)) };
}

/** Los últimos N días calendario de Chile, contando hoy: [hoy − N + 1, hoy]. */
export function lastDaysRange(now: Date, days: number): { fromKey: string; toKey: string } {
  const toKey = santiagoDayKey(now);
  return { fromKey: addDaysToKey(toKey, -(days - 1)), toKey };
}

/**
 * Líneas/ventas que cuentan para los reportes de PRODUCTO: venta COMPLETADA y que no sea de un pedido CANCELADO
 * (esa prenda nunca salió, aunque el reembolso siga pendiente). Los reportes de plata sí cuentan esas ventas hasta que
 * Belén registra el reembolso (la venta pasa a ANULADA).
 */
export function productSaleWhere(createdAt: { gte: Date; lt: Date }): Prisma.SaleWhereInput {
  return {
    status: "COMPLETADA",
    createdAt,
    OR: [{ onlineOrderId: null }, { onlineOrder: { is: { status: { not: "CANCELADO" } } } }],
  };
}

/** Cociente entero redondeado al peso (half-up) sin pasar por float. */
export function divRound(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}
