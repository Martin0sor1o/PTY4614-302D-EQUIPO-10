import type { z } from "zod";
import { AppError } from "@/lib/errors";

/** Valida con Zod y convierte el error en AppError VALIDATION con el primer mensaje (apto para la UI). */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? ` (${issue.path.join(".")})` : "";
    throw new AppError("VALIDATION", `${issue?.message ?? "Datos inválidos"}${path}`, { issues: parsed.error.issues });
  }
  return parsed.data;
}
