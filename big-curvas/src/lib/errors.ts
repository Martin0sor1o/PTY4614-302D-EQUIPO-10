export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STOCK_INSUFICIENTE"
  | "APROBACION_INVALIDA";

/** Error de negocio con código estable y mensaje en español apto para mostrar en la UI. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Mensaje seguro para mostrar al usuario: los errores de negocio tal cual; el resto, genérico. */
export function userMessage(error: unknown): string {
  return isAppError(error) ? error.message : "Ocurrió un error inesperado. Intenta nuevamente.";
}
