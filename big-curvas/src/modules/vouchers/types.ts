export type VoucherStatus = "VIGENTE" | "AGOTADO" | "VENCIDO" | "INACTIVO";

/** El estado se CALCULA (no se guarda): inactivo > vencido > agotado > vigente. */
export function voucherStatus(v: { active: boolean; balance: number; expiresAt: Date }, now = new Date()): VoucherStatus {
  if (!v.active) return "INACTIVO";
  if (v.expiresAt <= now) return "VENCIDO";
  if (v.balance <= 0) return "AGOTADO";
  return "VIGENTE";
}

export interface VoucherView {
  id: string;
  code: string;
  status: VoucherStatus;
  initialAmount: number;
  balance: number;
  expiresAt: Date;
  active: boolean;
  createdAt: Date;
  issuedLocationId: string;
  issuedLocationName: string;
  createdByName: string;
}

export interface VoucherMovementView {
  id: string;
  type: "EMISION" | "CANJE" | "REPOSICION";
  amount: number;
  balanceAfter: number;
  refType: string;
  refId: string | null;
  userName: string;
  createdAt: Date;
}

export interface IssuedVoucher {
  id: string;
  code: string;
  amount: number;
  expiresAt: Date;
}

export interface RedeemResult {
  voucherId: string;
  /** Lo que se descontó del vale (el menor entre el saldo y lo pedido). */
  amount: number;
  balanceAfter: number;
}
