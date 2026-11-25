import { isAppError, userMessage } from "@/lib/errors";

/** Resultado de las Server Actions de formularios de acceso: los errores de negocio vuelven como datos, no como excepción. */
export type FormFailure = { ok: false; message: string; code?: string };

/**
 * Convierte un error en el resultado para la pantalla. Los errores de negocio muestran su mensaje (ya es genérico donde
 * hace falta); cualquier otro se registra en el servidor y se muestra un mensaje general, sin detalles.
 */
export function toFailure(error: unknown): FormFailure {
  if (!isAppError(error)) console.error("[auth] error inesperado:", error instanceof Error ? error.message : "desconocido");
  return { ok: false, message: userMessage(error), code: isAppError(error) ? error.code : undefined };
}
