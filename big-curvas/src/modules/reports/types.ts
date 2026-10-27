export type ReportChannel = "todos" | "tienda" | "online";
export type ReportGroupBy = "day" | "week" | "month";

/** Plata cobrada (suma de `payments.amount`, CLP enteros). Tarjeta = débito + crédito. */
export interface SalesBucket {
  count: number;
  efectivo: number;
  debito: number;
  credito: number;
  tarjeta: number;
  transferencia: number;
  /** Otros medios (p. ej. VALE; hoy no se usa). */
  otros: number;
  total: number;
  /** Envío cobrado dentro del total (pedidos online). */
  shipping: number;
  averageTicket: number;
}

export interface SalesPeriodRow extends SalesBucket {
  /** Día ("2026-10-27"), lunes de la semana ("2026-10-26") o mes ("2026-10"). */
  key: string;
  /** Primer y último día del período dentro del rango pedido (un período en el borde puede ser parcial). */
  fromDay: string;
  toDay: string;
}

export interface PendingRefunds {
  orders: number;
  amount: number;
}

export interface SalesByPaymentMethod {
  from: string;
  to: string;
  channel: ReportChannel;
  groupBy: ReportGroupBy;
  rows: SalesPeriodRow[];
  totals: SalesBucket;
  /** Ventas ANULADAS cuyo día original cae en el rango (no suman arriba). */
  voided: { count: number; total: number };
  /** Pedidos cancelados con reembolso pendiente: su venta SIGUE sumando hasta que se registre el reembolso. */
  pendingRefunds: PendingRefunds;
}

export interface SummaryPeriod {
  fromDay: string;
  toDay: string;
  count: number;
  total: number;
}

export interface SalesSummaryCards {
  today: SummaryPeriod;
  week: SummaryPeriod;
  month: SummaryPeriod;
  pendingRefunds: PendingRefunds;
}

export interface TopSellerVariant {
  variantId: string;
  sku: string;
  color: string;
  size: string;
  units: number;
  revenue: number;
}

export interface TopSellerModel {
  /** Puesto: los modelos con las mismas unidades Y el mismo ingreso comparten puesto (1, 1, 3…). */
  rank: number;
  productId: string;
  modelCode: string;
  name: string;
  units: number;
  revenue: number;
  variants: TopSellerVariant[];
}

export interface TopSellers {
  from: string;
  to: string;
  models: TopSellerModel[];
  /** Modelos con ventas en el período (puede ser más que los mostrados). */
  totalModels: number;
  totalUnits: number;
  totalRevenue: number;
}

export interface LowStockRow {
  variantId: string;
  sku: string;
  productName: string;
  color: string;
  size: string;
  onHand: number;
  reserved: number;
  available: number;
  threshold: number;
  /** El producto fija su propio umbral (si no, rige `settings.low_stock_threshold`). */
  ownThreshold: boolean;
}

export interface LowStockLocation {
  locationId: string;
  code: string;
  name: string;
  rows: LowStockRow[];
}

export interface LowStock {
  threshold: number;
  locations: LowStockLocation[];
}

export interface NoRotationRow {
  variantId: string;
  sku: string;
  productName: string;
  color: string;
  size: string;
  totalOnHand: number;
  byLocation: { code: string; name: string; onHand: number }[];
  /** null = nunca se ha vendido. */
  lastSaleAt: Date | null;
  daysSinceLastSale: number | null;
}

export interface NoRotation {
  days: number;
  sinceDay: string;
  rows: NoRotationRow[];
}

export interface FridayRow {
  variantId: string;
  sku: string;
  productName: string;
  color: string;
  size: string;
  /** Unidades vendidas por la tienda en la ventana. */
  sold: number;
  storeAvailable: number;
  warehouseAvailable: number;
  /** min(disponible en bodega, max(0, vendido − disponible en tienda)). */
  suggested: number;
  /** Informativo: ya viene en un traslado EN_TRANSITO hacia la tienda (no se resta). */
  inTransitToStore: number;
}

export interface FridayList {
  days: number;
  fromDay: string;
  toDay: string;
  from: { code: string; name: string } | null;
  to: { code: string; name: string } | null;
  rows: FridayRow[];
  totalUnits: number;
}
