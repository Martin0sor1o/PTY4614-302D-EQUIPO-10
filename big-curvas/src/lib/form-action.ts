import { isAppError, userMessage } from "@/lib/errors";

/** Resultado de las Server Actions de formularios de acceso: los errores de negocio vuelven como datos, no como excepción. */
export type FormFailure = { ok: false; message: string; code?: string };

/**
 * Convierte un error en el resultado para la pantalla. Los errores de negocio muestran su mensaje (ya es genérico donde
 * hace falta); cualquier otro se muestra con un mensaje general, sin detalles, y `userMessage` lo registra ya limpio.
 */
export function toFailure(error: unknown): FormFailure {
  return { ok: false, message: userMessage(error), code: isAppError(error) ? error.code : undefined };
}
