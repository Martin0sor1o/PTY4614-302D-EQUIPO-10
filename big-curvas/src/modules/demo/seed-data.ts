// DEMO: datos de ejemplo de Big Curvas (ropa de tallas grandes). Precios en CLP con IVA incluido.

export interface LocationDef {
  code: "TIENDA_RANCAGUA" | "BODEGA";
  name: string;
  type: "STORE" | "WAREHOUSE";
  sellsPos: boolean;
  fulfillsOnline: boolean;
  salePrefix: string;
  /** DEMO: direcciones de ejemplo (aparecen en el ticket). */
  address?: string;
}

export const LOCATIONS: LocationDef[] = [
  { code: "TIENDA_RANCAGUA", name: "Tienda Rancagua", type: "STORE", sellsPos: true, fulfillsOnline: false, salePrefix: "RGA", address: "Calle de Ejemplo 123, Rancagua" },
  { code: "BODEGA", name: "Bodega", type: "WAREHOUSE", sellsPos: false, fulfillsOnline: true, salePrefix: "BOD" },
];

export interface UserDef {
  key: string;
  name: string;
  email: string;
  role: "ADMIN" | "VENDEDORA" | "BODEGA";
  locationCode: LocationDef["code"] | null;
}

export const USERS: UserDef[] = [
  { key: "belen", name: "Belén", email: "belen@bigcurvas.demo", role: "ADMIN", locationCode: null },
  { key: "vend-rga", name: "Vendedora Rancagua", email: "rancagua@bigcurvas.demo", role: "VENDEDORA", locationCode: "TIENDA_RANCAGUA" },
  { key: "vend-rga-2", name: "Vendedora 2 Rancagua", email: "rancagua2@bigcurvas.demo", role: "VENDEDORA", locationCode: "TIENDA_RANCAGUA" },
];

export const CATEGORIES = ["Jeans", "Blusas", "Vestidos", "Poleras", "Chaquetas"] as const;

// Tallas: numéricas (44–54) y letras (XL–4XL). sort_order define el orden de visualización.
export const SIZES: { code: string; sortOrder: number }[] = [
  { code: "44", sortOrder: 1 },
  { code: "46", sortOrder: 2 },
  { code: "48", sortOrder: 3 },
  { code: "50", sortOrder: 4 },
  { code: "52", sortOrder: 5 },
  { code: "54", sortOrder: 6 },
  { code: "XL", sortOrder: 10 },
  { code: "2XL", sortOrder: 11 },
  { code: "3XL", sortOrder: 12 },
  { code: "4XL", sortOrder: 13 },
];

export const COLORS: { code: string; name: string; hex: string }[] = [
  { code: "NEG", name: "Negro", hex: "#1a1a1a" },
  { code: "AZU", name: "Azul", hex: "#2f4f7f" },
  { code: "CEL", name: "Celeste", hex: "#9dbfe0" },
  { code: "BLA", name: "Blanco", hex: "#f5f5f0" },
  { code: "BEI", name: "Beige", hex: "#d8c8a8" },
  { code: "OLI", name: "Verde oliva", hex: "#6b6b3a" },
  { code: "BUR", name: "Burdeo", hex: "#6d1a2e" },
  { code: "ROS", name: "Rosado", hex: "#e8a5b5" },
  { code: "GRI", name: "Gris", hex: "#8a8a8a" },
  { code: "TER", name: "Terracota", hex: "#b5573a" },
];

export interface ProductDef {
  model: string;
  name: string;
  category: (typeof CATEGORIES)[number];
  price: number;
  colors: string[];
  sizes: string[];
  /** INTERNO: el código de barras es el SKU (Code 128). PROVEEDOR: EAN-13 del proveedor. */
  barcodeSource: "PROVEEDOR" | "INTERNO";
}

const JEANS_SIZES = ["44", "46", "48", "50", "52"];
const VESTIDO_SIZES = ["46", "48", "50", "52", "54"];
const PLUS_SIZES = ["XL", "2XL", "3XL", "4XL"];

export const PRODUCTS: ProductDef[] = [
  // Jeans
  { model: "JMT012", name: "Jeans Mom Tiro Alto", category: "Jeans", price: 29990, colors: ["AZU", "CEL", "NEG"], sizes: JEANS_SIZES, barcodeSource: "PROVEEDOR" },
  { model: "JRC014", name: "Jeans Recto Clásico", category: "Jeans", price: 27990, colors: ["AZU", "NEG"], sizes: JEANS_SIZES, barcodeSource: "PROVEEDOR" },
  { model: "JSK015", name: "Jeans Skinny Elástico", category: "Jeans", price: 26990, colors: ["AZU", "NEG", "GRI"], sizes: JEANS_SIZES, barcodeSource: "PROVEEDOR" },
  { model: "JWL016", name: "Jeans Wide Leg", category: "Jeans", price: 32990, colors: ["CEL", "AZU"], sizes: JEANS_SIZES, barcodeSource: "PROVEEDOR" },
  // Blusas
  { model: "BLC021", name: "Blusa Camisera Lino", category: "Blusas", price: 17990, colors: ["BLA", "BEI"], sizes: PLUS_SIZES, barcodeSource: "PROVEEDOR" },
  { model: "BLM022", name: "Blusa Manga Globo", category: "Blusas", price: 15990, colors: ["NEG", "BUR", "ROS"], sizes: PLUS_SIZES, barcodeSource: "PROVEEDOR" },
  { model: "BLV023", name: "Blusa Vuelo Estampada", category: "Blusas", price: 19990, colors: ["ROS", "OLI"], sizes: PLUS_SIZES, barcodeSource: "PROVEEDOR" },
  { model: "BLB024", name: "Blusa Básica Crepé", category: "Blusas", price: 14990, colors: ["NEG", "BLA", "BEI"], sizes: PLUS_SIZES, barcodeSource: "PROVEEDOR" },
  // Vestidos
  { model: "VCA031", name: "Vestido Camisero Largo", category: "Vestidos", price: 34990, colors: ["AZU", "OLI"], sizes: VESTIDO_SIZES, barcodeSource: "PROVEEDOR" },
  { model: "VFL032", name: "Vestido Floral Midi", category: "Vestidos", price: 29990, colors: ["ROS", "TER"], sizes: VESTIDO_SIZES, barcodeSource: "PROVEEDOR" },
  { model: "VNE033", name: "Vestido Cruzado Elegante", category: "Vestidos", price: 39990, colors: ["NEG", "BUR"], sizes: VESTIDO_SIZES, barcodeSource: "PROVEEDOR" },
  { model: "VPL034", name: "Vestido Playero Liviano", category: "Vestidos", price: 27990, colors: ["BLA", "CEL", "ROS"], sizes: VESTIDO_SIZES, barcodeSource: "PROVEEDOR" },
  // Poleras
  { model: "PBA041", name: "Polera Básica Algodón", category: "Poleras", price: 8990, colors: ["NEG", "BLA", "GRI"], sizes: PLUS_SIZES, barcodeSource: "PROVEEDOR" },
  { model: "POV042", name: "Polera Oversize Lisa", category: "Poleras", price: 10990, colors: ["BLA", "BEI", "OLI"], sizes: PLUS_SIZES, barcodeSource: "PROVEEDOR" },
  { model: "PCR043", name: "Polera Cuello Redondo Stretch", category: "Poleras", price: 9990, colors: ["NEG", "BUR"], sizes: PLUS_SIZES, barcodeSource: "PROVEEDOR" },
  { model: "PRY044", name: "Polera Rayada Manga Larga", category: "Poleras", price: 12990, colors: ["AZU", "NEG"], sizes: PLUS_SIZES, barcodeSource: "PROVEEDOR" },
  // Chaquetas (código de barras interno = SKU)
  { model: "CJE051", name: "Chaqueta Jeans Clásica", category: "Chaquetas", price: 36990, colors: ["AZU", "NEG"], sizes: PLUS_SIZES, barcodeSource: "INTERNO" },
  { model: "CBO052", name: "Chaqueta Bomber", category: "Chaquetas", price: 42990, colors: ["NEG", "OLI"], sizes: PLUS_SIZES, barcodeSource: "INTERNO" },
  { model: "CPU053", name: "Chaqueta Puffer Ligera", category: "Chaquetas", price: 49990, colors: ["NEG", "BUR"], sizes: PLUS_SIZES, barcodeSource: "INTERNO" },
  { model: "CBL054", name: "Blazer Entallado", category: "Chaquetas", price: 44990, colors: ["NEG", "GRI"], sizes: PLUS_SIZES, barcodeSource: "INTERNO" },
];

/** Unidades por ubicación (código de ubicación → cantidad). */
export type StockByLocation = Record<LocationDef["code"], number>;

/**
 * Casos armados a mano para las pruebas de la demo (el resto del stock es pseudoaleatorio pero fijo).
 */
export const STOCK_OVERRIDES: Record<string, StockByLocation> = {
  // Última unidad en la tienda (sirve para probar dos ventas simultáneas)
  "JMT012-AZU-48": { TIENDA_RANCAGUA: 1, BODEGA: 8 },
  // Sin stock en la tienda, con stock en bodega (el POS muestra dónde)
  "JMT012-NEG-48": { TIENDA_RANCAGUA: 0, BODEGA: 6 },
  // Producto de alta rotación
  "PBA041-NEG-XL": { TIENDA_RANCAGUA: 5, BODEGA: 20 },
  // Solo en la tienda: un pedido online lo aparta en la tienda y lo trae a bodega
  "CPU053-NEG-2XL": { TIENDA_RANCAGUA: 3, BODEGA: 0 },
  // Solo en bodega: ideal para un traspaso Bodega → tienda
  "BLM022-BUR-3XL": { TIENDA_RANCAGUA: 0, BODEGA: 5 },
  // Poco stock en ambas
  "VNE033-NEG-52": { TIENDA_RANCAGUA: 1, BODEGA: 2 },
};

export const DEMO_SETTINGS: { key: string; valueInt: number; description: string; isDemoValue: boolean }[] = [
  {
    key: "max_seller_discount_bps",
    valueInt: 0,
    description: "Descuento máximo por línea que la vendedora puede aplicar sin aprobación (puntos básicos). 0 %: solo Belén da descuentos (RN-09, confirmado con la clienta).",
    isDemoValue: false,
  },
  {
    key: "approval_timeout_minutes",
    valueInt: 10,
    description: "Minutos antes de que una solicitud de aprobación venza. Valor propuesto (pendiente de validar).",
    isDemoValue: true,
  },
];
