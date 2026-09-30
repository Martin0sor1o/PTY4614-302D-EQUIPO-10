// API pública de sales SEGURA PARA EL NAVEGADOR: solo funciones puras y tipos (sin Prisma ni Node).
// Los componentes cliente importan de "@/modules/sales/client"; el navegador solo MUESTRA cálculos,
// el servidor los recalcula siempre (el total del servidor manda).

export {
  effectivePrice,
  priceLine,
  priceSale,
  quotePayment,
  changeFor,
  expectedCash,
  cashDifference,
  isDiscountOverLimit,
  assertDiscountWithinLimit,
  type PricedLine,
  type PricedSale,
  type PaymentMethodCode,
  type PaymentQuote,
} from "./pricing";
export type {
  CashClosingTotals,
  CashSessionView,
  DaySales,
  PosItem,
  PosItemStock,
  SaleLineView,
  SalePaymentView,
  SaleView,
} from "./types";
