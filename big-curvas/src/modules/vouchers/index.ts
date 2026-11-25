// API pública del módulo vouchers (ADR-021): vales con código, saldo y vencimiento. Módulo HOJA: no importa sales ni returns
// (el doc 03 dibuja returns → sales, así que sales no puede importar returns; ambos usan este módulo).
//
// Saldo materializado (`vouchers.balance`) + libro inmutable (`voucher_movements`, trigger de solo-INSERT), en la misma
// transacción de quien llama, igual que stock_levels / inventory_movements.

export { issueVoucher } from "./issue";
export { redeemVoucher, restoreRedemption, resolveVoucherCode, assertVoucherUsable } from "./redeem";
export { lookupVoucher, listVouchers, getVoucherLedger, findVoucherLedgerMismatches, type VoucherFilter, type VoucherLedgerMismatch } from "./queries";
export { deactivateVoucher } from "./manage";
export { generateVoucherCode, normalizeVoucherCode, formatVoucherCode, VOUCHER_CODE_BITS, VOUCHER_CODE_CHARS } from "./code";
export { SETTING_VALIDITY_DAYS, VALIDITY_DAYS_DEFAULT, LOOKUP_MAX_ATTEMPTS, LOOKUP_LOCK_MINUTES } from "./internal";
export { voucherStatus } from "./types";
export type { IssuedVoucher, RedeemResult, VoucherMovementView, VoucherStatus, VoucherView } from "./types";
