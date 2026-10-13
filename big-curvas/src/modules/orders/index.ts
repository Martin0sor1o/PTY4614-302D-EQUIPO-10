// API pública de OrdersService (pedidos online). Las pantallas y Server Actions importan solo desde aquí.
// Reglas: docs/02 §2.7 (RF-PED), docs/03 §6.2, ADR-004 v3. El stock solo se mueve vía InventoryService.

export { registerOrder, updateOrder, type RegisterOrderInput, type UpdateOrderInput } from "./register";
export { confirmPayment, type ConfirmPaymentInput } from "./payment";
export {
  prepareOrder,
  dispatchOrder,
  markDelivered,
  type PrepareOrderInput,
  type DispatchOrderInput,
  type DeliverOrderInput,
} from "./fulfillment";
export { cancelOrder, type CancelOrderInput } from "./cancel";

export {
  getOrderDetail,
  getOrderBoard,
  countOrdersToPrepare,
  getCouriers,
  searchOrderVariants,
  getVariantAvailability,
  SETTING_COURIERS,
} from "./queries";
export { STATUS_LABEL as ORDER_STATUS_LABEL } from "./internal";

export type {
  LocationAvailability,
  OrderBoard,
  OrderBoardItem,
  OrderDetail,
  OrderEventView,
  OrderLineView,
  OrderStatus,
  OrderTransferView,
  OrderVariantHit,
} from "./types";
