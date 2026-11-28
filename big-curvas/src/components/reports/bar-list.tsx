import { cn } from "@/lib/utils";

export interface BarItem {
  key: string;
  label: string;
  /** Aclaración junto al nombre ("en curso"). */
  tag?: string;
  /** El dato, escrito: la barra solo lo ilustra. */
  value: string;
  detail: string;
  /** Ancho de la barra, 0 a 100. Solo para dibujar. */
  width: number;
  barClass: string;
}

/**
 * Barras horizontales (CSS, sin dependencias). Cada fila lleva nombre, monto y detalle en texto, así que se leen igual sin
 * ver las barras ni distinguir colores; las barras son decorativas para el lector de pantalla.
 */
export function BarList({ label, items, dots = false, className }: { label: string; items: BarItem[]; dots?: boolean; className?: string }) {
  return (
    <ul aria-label={label} className={cn("space-y-3", className)}>
      {items.map((item) => (
        <li key={item.key} className="space-y-1 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="flex items-center gap-2 font-semibold">
              {dots && <span aria-hidden className={cn("size-3 rounded-full", item.barClass)} />}
              {item.label}
              {item.tag && <span className="font-normal text-muted-foreground">({item.tag})</span>}
            </span>
            <span className="tabular-nums">
              <span className="font-bold">{item.value}</span>
              <span className="text-muted-foreground"> · {item.detail}</span>
            </span>
          </div>
          <span className="block h-3 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <span className={cn("block h-full rounded-full", item.barClass)} style={{ width: `${item.width}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
