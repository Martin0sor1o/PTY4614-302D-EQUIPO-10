// API pública de returns SEGURA PARA EL NAVEGADOR: solo funciones puras, constantes y tipos (sin Prisma ni Node).
// Los componentes cliente importan de "@/modules/returns/client"; el servidor siempre recalcula.

export {
  proratedAmount,
  daysSince,
  isOutOfWindow,
  quoteRefund,
  suggestRefundMethod,
  splitExchange,
  approvalNeed,
  type MoneyRefundMethod,
  type RefundQuote,
  type ExchangeSplit,
  type ApprovalNeed,
  type ReturnApprovalType,
} from "./pricing";
export { paidWithText, returnDoneTitle, daysText, pendingSummaryText } from "./texts";
export { BELEN_VALIDATION_DATE, DELIVERED_ONLINE_OPEN_NOTE, RETURN_ASSUMPTIONS, RETURN_REASONS, RETURN_REASON_LABEL, type ReturnAssumption, type ReturnReasonCode } from "./rules";
export type {
  QuotedLine,
  RefundMethod,
  ReturnCondition,
  ReturnQuote,
  ReturnSaleHit,
  ReturnType,
  ReturnView,
  ReturnableLine,
  ReturnableSale,
} from "./types";
