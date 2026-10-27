import { Banknote, Check, CreditCard, Landmark, Minus, Plus, ScanBarcode } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCLP } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Direction } from "../_lib/directions";
import { StatusChip } from "./brand";

const LINES = [
  { name: "Jeans Mom Tiro Alto", variant: "Azul · talla 48", sku: "JMT012-AZU-48", qty: 1, price: 29990, reserved: false },
  { name: "Polera Básica Algodón", variant: "Negro · talla XL", sku: "PBA041-NEG-XL", qty: 2, price: 8990, reserved: true },
];
const SUBTOTAL = LINES.reduce((n, l) => n + l.qty * l.price, 0);
const RECEIVED = 50000;

const METHODS = [
  { label: "Efectivo", icon: Banknote, selected: true },
  { label: "Débito", icon: CreditCard },
  { label: "Crédito", icon: CreditCard },
  { label: "Transferencia", icon: Landmark },
] as const;

/** Fragmento de la caja (POS) real con datos de ejemplo: lector con foco, carrito, total y cobro. Solo estilo, misma disposición. */
export function PosPreview({ d }: { d: Direction }) {
  const compact = d.density === "compacta";
  const gap = compact ? "gap-2" : "gap-3";
  const pad = compact ? "p-2" : "p-3";
  return (
    <div className={cn("space-y-3 p-3 @lg:p-4", compact && "space-y-2")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={cn("dir-display", d.ui.h1)}>Venta</h3>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          Caja abierta · Vendedora Rancagua
        </span>
      </div>

      <div className={cn("grid @xl:grid-cols-[minmax(0,1fr)_14.5rem]", gap)}>
        {/* Carrito */}
        <section aria-label="Carrito" className={cn("space-y-2", compact && "space-y-1.5")}>
          <div className="relative">
            <ScanBarcode className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            {/* El foco del lector es permanente: se muestra con el anillo de foco. */}
            <Input
              readOnly
              aria-label="Escanear o buscar prenda"
              placeholder="Escanea una prenda o busca por nombre"
              className={cn("pl-10 text-base ring-2 ring-ring ring-offset-2 ring-offset-background", d.ui.field, compact ? "h-11" : "h-12")}
            />
          </div>

          <div className={cn("overflow-hidden border bg-card", d.ui.frame)}>
            <ul className="divide-y" aria-label="Prendas del carrito">
              {LINES.map((l) => (
                <li key={l.sku} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center", gap, pad)}>
                  <div className="min-w-0">
                    <div className="text-sm leading-tight font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.variant} · <span className="font-mono">{l.sku}</span>
                    </div>
                    {l.reserved && <StatusChip spec={{ label: "1 reservada para PED-000007", tone: "violet" }} d={d} className="mt-1 text-[11px]" />}
                  </div>
                  {/* Maqueta reducida: el total y la cantidad se apilan; en la caja real (carrito de ~880 px) van en una sola fila. */}
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-base font-semibold tabular-nums">{formatCLP(l.qty * l.price)}</div>
                    <div className="flex items-center gap-1" role="group" aria-label={`Cantidad de ${l.sku}`}>
                      <Button variant="outline" size="icon" aria-label="Quitar una unidad" className={cn("rounded-full", compact ? "size-8" : "size-9")}>
                        <Minus className="size-4" aria-hidden />
                      </Button>
                      <span className="w-6 text-center text-base font-semibold tabular-nums">{l.qty}</span>
                      <Button variant="outline" size="icon" aria-label="Agregar una unidad" className={cn("rounded-full", compact ? "size-8" : "size-9")}>
                        <Plus className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pago */}
        <aside aria-label="Pago" className={cn("space-y-2", compact && "space-y-1.5")}>
          <div className={cn("space-y-1 border bg-card", d.ui.frame, pad, d.ui.card)}>
            <dl className="space-y-0.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatCLP(SUBTOTAL)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Descuentos</dt>
                <dd className="tabular-nums">{formatCLP(0)}</dd>
              </div>
            </dl>
            <div className="flex items-baseline justify-between border-t pt-1.5">
              <span className="text-sm font-medium">Total a cobrar</span>
              <span className={cn("font-bold tabular-nums", compact ? "text-2xl" : "text-3xl")}>{formatCLP(SUBTOTAL)}</span>
            </div>
          </div>

          <div className={cn("space-y-2 border bg-card", d.ui.frame, pad)}>
            <div role="radiogroup" aria-label="Medio de pago" className="grid grid-cols-2 gap-1.5">
              {METHODS.map((m) => {
                const on = "selected" in m && m.selected;
                return (
                  <button
                    key={m.label}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={cn(
                      "flex items-center justify-center gap-1.5 border text-xs font-medium",
                      d.id === "C" ? "rounded-[2px]" : "rounded-full",
                      compact ? "min-h-9" : "min-h-11",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-secondary",
                    )}
                  >
                    {on ? <Check className="size-4" aria-hidden /> : <m.icon className="size-4" aria-hidden />}
                    {m.label}
                  </button>
                );
              })}
            </div>
            <div>
              <label htmlFor={`recv-${d.id}`} className="mb-1 block text-xs font-medium">
                Recibido
              </label>
              <Input id={`recv-${d.id}`} readOnly value={formatCLP(RECEIVED)} className={cn("text-right text-lg tabular-nums", d.ui.field, compact ? "h-10" : "h-11")} />
            </div>
            <div className="flex items-baseline justify-between rounded-lg bg-secondary px-3 py-1.5">
              <span className="text-sm font-medium">Vuelto</span>
              <span className="text-lg font-bold tabular-nums">{formatCLP(RECEIVED - SUBTOTAL)}</span>
            </div>
          </div>

          <Button type="button" className={cn(d.ui.button, "w-full text-base", compact ? "h-12" : "h-14")}>
            Cobrar {formatCLP(SUBTOTAL)}
          </Button>
        </aside>
      </div>
    </div>
  );
}
