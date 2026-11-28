// El campo del PIN en «Belén está aquí».
//  · Largo: el que acepta el servidor al aprobar (modules/approvals: texto de 4 a 12 caracteres).
//  · Solo dígitos: así se crean todos los PIN (6 en la app; de 4 a 6 en la semilla de la demo). Dejar pasar letras o
//    espacios haría que un error de tipeo gaste un intento y acerque el bloqueo del PIN.

export const APPROVER_PIN_MIN = 4;
export const APPROVER_PIN_MAX = 12;

export function cleanApproverPin(typed: string): string {
  return typed.replace(/\D/g, "").slice(0, APPROVER_PIN_MAX);
}
