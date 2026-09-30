import { db } from "@/lib/db";
import { getDiscountLimitBps } from "./internal";

/** Límite de descuento por línea (puntos básicos) desde `settings`. Para mostrarlo en el POS; el servidor lo vuelve a validar. */
export async function getDiscountLimit(): Promise<number> {
  return getDiscountLimitBps(db);
}
