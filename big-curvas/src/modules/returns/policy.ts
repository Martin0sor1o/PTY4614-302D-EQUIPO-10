import type { Tx } from "@/lib/db";
import {
  RETURN_WINDOW_DAYS_DEFAULT,
  SETTING_RETURN_WINDOW_DAYS,
  SETTING_VALIDITY_DAYS,
  SETTING_VOUCHER_SELLER_CAP,
  VALIDITY_DAYS_DEFAULT,
  VOUCHER_SELLER_CAP_DEFAULT,
} from "./rules";

// Valores vigentes de las reglas de ADR-021: `settings` si la fila existe y es válida; si no, el valor por omisión.

export interface ReturnPolicy {
  /** S-01 */
  windowDays: number;
  /** S-08 */
  voucherSellerCap: number;
  voucherValidityDays: number;
}

const positiveInt = (v: number | null | undefined, fallback: number) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : fallback);

/** Valores vigentes: `settings` si la fila existe y es válida; si no, el valor por omisión de la regla. */
export async function getReturnPolicy(reader: Pick<Tx, "setting">): Promise<ReturnPolicy> {
  const rows = await reader.setting.findMany({
    where: { key: { in: [SETTING_RETURN_WINDOW_DAYS, SETTING_VOUCHER_SELLER_CAP, SETTING_VALIDITY_DAYS] } },
    select: { key: true, valueInt: true },
  });
  const value = (key: string) => rows.find((r) => r.key === key)?.valueInt;
  return {
    windowDays: positiveInt(value(SETTING_RETURN_WINDOW_DAYS), RETURN_WINDOW_DAYS_DEFAULT),
    voucherSellerCap: positiveInt(value(SETTING_VOUCHER_SELLER_CAP), VOUCHER_SELLER_CAP_DEFAULT),
    voucherValidityDays: positiveInt(value(SETTING_VALIDITY_DAYS), VALIDITY_DAYS_DEFAULT),
  };
}
