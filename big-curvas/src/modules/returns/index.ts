// API pública de ReturnsService (server): cambios y devoluciones (RF-DEV-01 a 07, ADR-021). Las Server Actions importan solo
// desde aquí. Para el navegador (cálculos puros, reglas de ADR-021 y tipos) usar "@/modules/returns/client".
//
// Stock solo vía InventoryService (returnToStock / writeOff); vales en el módulo `vouchers`; venta del cambio con
// `sales.createSaleInTx`; aprobaciones con `approvals`. Una devolución es UNA transacción idempotente.

export { createReturn, type CreateReturnInput } from "./create-return";
export { quoteReturn, returnBinding } from "./quote";
export { requestReturnApproval } from "./approvals";
export { getReturn, getSaleForReturn, searchSalesForReturn } from "./queries";
export { getReturnPolicy, type ReturnPolicy } from "./policy";
export {
  createReturnRequestSchema,
  quoteReturnRequestSchema,
  requestReturnApprovalRequestSchema,
  returnLineSchema,
  resolutionSchema,
  type ReturnLineInput,
  type ReturnResolutionInput,
} from "./schemas";
export {
  RETURN_ASSUMPTIONS,
  RETURN_REASONS,
  RETURN_REASON_LABEL,
  RETURN_WINDOW_DAYS_DEFAULT,
  SETTING_RETURN_WINDOW_DAYS,
  SETTING_VOUCHER_SELLER_CAP,
  VOUCHER_SELLER_CAP_DEFAULT,
} from "./rules";
export * from "./client";
