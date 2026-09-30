// API pública de SalesService (server). Las pantallas y Server Actions importan solo desde aquí.
// Para el navegador (funciones puras de precios) usar "@/modules/sales/client".

export { createSale, type CreateSaleInput } from "./create-sale";
export {
  openCashSession,
  closeCashSession,
  getOpenCashSession,
  getCashSession,
  getCashClosingTotals,
} from "./cash";
export { searchPosItems, getPosItemsByIds, getSaleForActor, listSalesOfDay } from "./queries";
export { SETTING_MAX_DISCOUNT } from "./internal";
export { getDiscountLimit } from "./settings";
export { saleRequestSchema } from "./schemas";

export * from "./client";
