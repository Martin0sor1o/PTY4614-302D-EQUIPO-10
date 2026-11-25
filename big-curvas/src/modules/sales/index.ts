// API pública de SalesService (server). Las pantallas y Server Actions importan solo desde aquí.
// Para el navegador (funciones puras de precios) usar "@/modules/sales/client".

export { createSale, createSaleInTx, type CreateSaleInput, type SalePaymentInput, type SaleTxInput, type SaleTxResult } from "./create-sale";
export { lockOpenCashSession as lockOpenCashSessionInTx } from "./internal";
export { createOnlineSale, type CreateOnlineSaleInput, type OnlineSaleResult } from "./online-sale";
export { voidSale, voidOnlineSale } from "./void-sale";
export { requestDiscountApproval, requestVoidApproval, cartBinding, voidBinding, assertVoidable, type CartLineInput } from "./approvals";
export {
  openCashSession,
  closeCashSession,
  getOpenCashSession,
  getCashSession,
  getCashClosingTotals,
} from "./cash";
export { searchPosItems, getPosItemsByIds, getSaleForActor, listSalesOfDay } from "./queries";
export { SETTING_MAX_DISCOUNT, getDiscountLimitBps } from "./internal";
export { getDiscountLimit } from "./settings";
export { saleRequestSchema, paymentInputSchema } from "./schemas";

export * from "./client";
