// DEMO: pasos de la presentación (Inicio → "Guion de demo"). Solo se muestra con DEMO_MODE=true.
// Los SKU y las cantidades son los casos de prueba del seed (docs/DEMO_PLAN.md).

export interface DemoStepLink {
  label: string;
  href: string;
}

export interface DemoStep {
  id: string;
  title: string;
  /** Con qué usuario entrar ("Entrar como…"). */
  who: string;
  links: DemoStepLink[];
  /** Qué mostrar, en orden. */
  show: string[];
  /** Qué problema del negocio resuelve (una línea). */
  problem: string;
}

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    id: "stock",
    title: "Stock en tiempo real",
    who: "Belén",
    links: [
      { label: "Abrir Stock", href: "/stock" },
      { label: "Buscar JMT012-AZU-48", href: "/stock?q=JMT012-AZU-48" },
    ],
    show: [
      "La matriz muestra cada prenda por ubicación: Tienda Rancagua, Bodega, En tránsito y Por resolver.",
      "Busca JMT012-AZU-48: 1 unidad en la tienda y 8 en la bodega. La pantalla se actualiza sola cada pocos segundos.",
    ],
    problem: "Saber en segundos dónde está cada prenda, sin llamar a la bodega ni contar a mano.",
  },
  {
    id: "venta",
    title: "Venta de la última unidad en el POS",
    who: "Vendedora Rancagua",
    links: [
      { label: "Abrir caja", href: "/pos/caja" },
      { label: "Ir al POS", href: "/pos" },
    ],
    show: [
      "Abre la caja (si no está abierta), escanea o busca JMT012-AZU-48 y cobra en efectivo, tarjeta o transferencia.",
      "En Stock la tienda queda en 0 al instante y la bodega sigue con 8; el POS avisa dónde hay stock si otra vendedora busca la prenda.",
    ],
    problem: "Que dos personas no vendan la misma última prenda y que el stock baje en el momento de la venta.",
  },
  {
    id: "descuento",
    title: "Descuento con aprobación de Belén desde el celular",
    who: "Vendedora Rancagua en el computador · Belén en el celular (u otro navegador)",
    links: [
      { label: "POS (vendedora)", href: "/pos" },
      { label: "Aprobaciones (Belén)", href: "/aprobaciones" },
    ],
    show: [
      "La vendedora agrega PBA041-NEG-XL y pone 10 % de descuento: el POS responde “Requiere aprobación de Belén” y ella la pide.",
      "Belén abre Aprobaciones en el celular y aprueba (o usa “Belén está aquí” con el PIN 2468). La caja sigue sola y la aprobación sirve una sola vez.",
    ],
    problem: "Solo Belén da descuentos, aunque no esté en la tienda, y todo queda registrado.",
  },
  {
    id: "traslado",
    title: "Traslado Bodega → Tienda con una diferencia",
    who: "Belén (Operando en: Bodega) y Vendedora Rancagua",
    links: [
      { label: "Nuevo traslado", href: "/traslados/nuevo" },
      { label: "Traslados", href: "/traslados" },
      { label: "Con diferencias", href: "/traslados?tab=con-diferencias" },
    ],
    show: [
      "Belén crea un traslado de 3 × BLM022-BUR-3XL (la bodega tiene 5) y lo envía: el stock aparece “En tránsito” y se imprime la guía.",
      "La vendedora recibe escaneando solo 2. El traslado queda con diferencias y la matriz muestra 1 en “Por resolver”.",
      "Belén lo resuelve (merma, reenvío o error de envío) y el traslado se cierra.",
    ],
    problem: "Saber qué se perdió en el camino y que alguien lo resuelva, sin que el stock se ajuste solo.",
  },
  {
    id: "pedido",
    title: "Pedido de Instagram: pago, aparte en tienda y despacho",
    who: "Belén y Vendedora Rancagua",
    links: [
      { label: "Nuevo pedido", href: "/pedidos/nuevo" },
      { label: "Pedidos", href: "/pedidos" },
      { label: "Traslados", href: "/traslados" },
    ],
    show: [
      "Belén registra un pedido con CPU053-NEG-2XL (bodega 0, tienda 3): al registrar no se aparta nada.",
      "Al confirmar el pago elige “Apartar en Tienda Rancagua”; se crea solo el traslado a la bodega. La vendedora lo envía y Belén lo recibe.",
      "Belén prepara escaneando la prenda y despacha con courier y N.º de seguimiento.",
    ],
    problem: "Vender por Instagram sin prometer lo que no hay y sin perder la prenda entre la tienda y la bodega.",
  },
  {
    id: "anulacion",
    title: "Anulación con PIN y reembolso de un pedido cancelado",
    who: "Vendedora Rancagua y Belén",
    links: [
      { label: "Ventas del día", href: "/pos/ventas" },
      { label: "Pedidos", href: "/pedidos" },
    ],
    show: [
      "La vendedora anula una venta de hoy con motivo; Belén, estando presente, la aprueba con su PIN (2468). El stock vuelve y el kardex lo muestra.",
      "Belén cancela un pedido pagado (la prenda vuelve a estar libre) y registra el reembolso desde el detalle del pedido.",
    ],
    problem: "Corregir errores y devolver dinero con el respaldo de Belén, dejando todo registrado.",
  },
  {
    id: "reportes",
    title: "Reportes de Belén",
    who: "Belén",
    links: [
      { label: "Ventas por medio de pago", href: "/reportes?tab=ventas" },
      { label: "Más vendidos", href: "/reportes?tab=mas-vendidos" },
      { label: "Stock bajo", href: "/reportes?tab=stock-bajo" },
      { label: "Sin rotación", href: "/reportes?tab=sin-rotacion" },
      { label: "Lista del viernes", href: "/reportes?tab=viernes" },
    ],
    show: [
      "Ventas por medio de pago (día, semana o mes) y por canal, con 8 semanas de historial de ejemplo.",
      "Más vendidos, stock bajo (de menos a más disponible), prendas sin rotación y la lista del viernes lista para imprimir.",
    ],
    problem: "Decidir qué reponer y qué llevar a la tienda con datos, en vez de a ojo.",
  },
];
