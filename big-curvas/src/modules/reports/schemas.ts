import { z } from "zod";
import { daysBetweenKeys } from "@/lib/dates";

export const MAX_RANGE_DAYS = 366;

const dayKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (usa AAAA-MM-DD)")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Esa fecha no existe");

/** Rango de días calendario de Chile, ambos extremos incluidos. */
export const rangeSchema = z
  .object({ from: dayKey, to: dayKey })
  .refine((r) => r.from <= r.to, { message: "La fecha inicial no puede ser posterior a la final", path: ["from"] })
  .refine((r) => r.from > r.to || daysBetweenKeys(r.from, r.to) < MAX_RANGE_DAYS, {
    message: `El rango no puede superar ${MAX_RANGE_DAYS} días`,
    path: ["to"],
  });

export const salesReportSchema = z.object({
  from: dayKey,
  to: dayKey,
  channel: z.enum(["todos", "tienda", "online"]).default("todos"),
  groupBy: z.enum(["day", "week", "month"]).default("day"),
});

export const topSellersSchema = z.object({
  from: dayKey,
  to: dayKey,
  limit: z.number().int().min(1).max(100).default(20),
});
