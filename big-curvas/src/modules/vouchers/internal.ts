import type { Tx } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { voucherStatus, type VoucherView } from "./types";

// Utilidades internas del módulo vouchers (no se exportan desde index.ts).

/** Vigencia del vale en días (RN-16, 3 meses; validado con Belén el 26/11/2026). `settings` la sobrescribe; sin fila rige este valor (S-08). */
export const SETTING_VALIDITY_DAYS = "store_credit_validity_days";
export const VALIDITY_DAYS_DEFAULT = 90;

/** Búsqueda por código: intentos fallidos antes de bloquear a quien busca y minutos de bloqueo (como el código de vinculación). */
export const LOOKUP_MAX_ATTEMPTS = 10;
export const LOOKUP_LOCK_MINUTES = 15;

export const ROLES = ["ADMIN", "VENDEDORA"] as const;

export async function getValidityDays(reader: Pick<Tx, "setting">): Promise<number> {
  const s = await reader.setting.findUnique({ where: { key: SETTING_VALIDITY_DAYS } });
  return s?.valueInt && s.valueInt > 0 ? s.valueInt : VALIDITY_DAYS_DEFAULT;
}

export const viewSelect = {
  id: true,
  code: true,
  initialAmount: true,
  balance: true,
  expiresAt: true,
  active: true,
  createdAt: true,
  issuedLocationId: true,
  issuedLocation: { select: { name: true } },
  creator: { select: { name: true } },
} satisfies Prisma.VoucherSelect;

type Row = Prisma.VoucherGetPayload<{ select: typeof viewSelect }>;

export function toView(row: Row, now = new Date()): VoucherView {
  return {
    id: row.id,
    code: row.code,
    status: voucherStatus(row, now),
    initialAmount: row.initialAmount,
    balance: row.balance,
    expiresAt: row.expiresAt,
    active: row.active,
    createdAt: row.createdAt,
    issuedLocationId: row.issuedLocationId,
    issuedLocationName: row.issuedLocation.name,
    createdByName: row.creator.name,
  };
}

/** Últimos 4 caracteres del código: lo único que va a audit_log (el código completo es una credencial al portador). */
export const codeTail = (code: string) => code.slice(-4);
