import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Direction } from "../_lib/directions";
import { CHIPS, StatusChip } from "./brand";

interface Cell {
  n: number;
  tag?: "low" | "none";
  reserved?: number;
}
interface Row {
  name: string;
  variant: string;
  sku: string;
  rancagua: Cell;
  bodega: Cell;
  transit?: number;
}

// Datos de ejemplo tomados de los casos de prueba del seed (no se leen de la base de datos).
const ROWS: Row[] = [
  { name: "Jeans Mom Tiro Alto", variant: "Azul · 48", sku: "JMT012-AZU-48", rancagua: { n: 1, tag: "low" }, bodega: { n: 8 } },
  { name: "Jeans Mom Tiro Alto", variant: "Negro · 48", sku: "JMT012-NEG-48", rancagua: { n: 0, tag: "none" }, bodega: { n: 6 } },
  { name: "Polera Básica Algodón", variant: "Negro · XL", sku: "PBA041-NEG-XL", rancagua: { n: 5 }, bodega: { n: 20 } },
  { name: "Chaqueta Puffer Ligera", variant: "Negro · 2XL", sku: "CPU053-NEG-2XL", rancagua: { n: 2, reserved: 1 }, bodega: { n: 0, tag: "none" } },
  { name: "Blusa Manga Globo", variant: "Burdeos · 3XL", sku: "BLM022-BUR-3XL", rancagua: { n: 0, tag: "none" }, bodega: { n: 2 }, transit: 3 },
];

function StockCell({ cell, d, transit }: { cell: Cell; d: Direction; transit?: number }) {
  return (
    <div className="flex flex-col items-center gap-1 leading-tight">
      <span className={cn("text-base font-semibold tabular-nums", cell.n === 0 && "font-normal text-muted-foreground")}>{cell.n}</span>
      {cell.tag === "low" && <StatusChip spec={CHIPS.low} d={d} className="text-[11px]" />}
      {cell.tag === "none" && <StatusChip spec={CHIPS.none} d={d} className="text-[11px]" />}
      {cell.reserved ? <span className="text-[11px] text-muted-foreground">de 3 · {cell.reserved} res.</span> : null}
      {/* En espacio angosto el tránsito baja a la celda de Bodega; con ancho tiene su propia columna. */}
      {transit ? <StatusChip spec={{ ...CHIPS.transit, label: `${transit} en camino` }} d={d} className="text-[11px] @xl:hidden" /> : null}
    </div>
  );
}

/** La pantalla Stock real, con datos de ejemplo, para juzgar la jerarquía en contexto. */
export function StockPreview({ d }: { d: Direction }) {
  return (
    <div className="space-y-4 p-3 @lg:p-4">
      <div>
        <h3 className={cn("dir-display", d.ui.h1)}>Stock</h3>
        <p className="mt-1 text-sm text-muted-foreground">Disponible por ubicación (físico − reservado). Las demás ubicaciones son solo de consulta.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="relative block w-full max-w-64">
          <span className="sr-only">Buscar prenda</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input readOnly placeholder="Escanea o busca un SKU" className={cn("pl-9", d.ui.field)} />
        </label>
        <p className="text-sm text-muted-foreground">5 variantes</p>
      </div>

      <div className={cn("overflow-hidden", d.ui.tableWrap)}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn("px-2", d.ui.thead)}>Prenda</TableHead>
              <TableHead className={cn("bg-primary/10 px-1 text-center", d.ui.thead, d.id === "C" && "bg-[#4B1D5E]")}>Rancagua</TableHead>
              <TableHead className={cn("px-1 text-center", d.ui.thead)}>Bodega</TableHead>
              <TableHead className={cn("hidden px-1 text-center leading-tight whitespace-normal @xl:table-cell", d.ui.thead)}>En tránsito</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((r) => (
              <TableRow key={r.sku}>
                <TableCell className="px-2 whitespace-normal">
                  <div className="text-[13px] leading-tight font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.variant}</div>
                  <a href="#" className="font-mono text-[11px] whitespace-nowrap text-brand-ink underline underline-offset-4">
                    {r.sku}
                  </a>
                </TableCell>
                <TableCell className="bg-primary/5 px-1 text-center">
                  <StockCell cell={r.rancagua} d={d} />
                </TableCell>
                <TableCell className="px-1 text-center">
                  <StockCell cell={r.bodega} d={d} transit={r.transit} />
                </TableCell>
                <TableCell className="hidden px-1 text-center tabular-nums @xl:table-cell">
                  {r.transit ? <StatusChip spec={{ ...CHIPS.transit, label: `${r.transit} en camino` }} d={d} className="text-[11px]" /> : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Leyenda:</span>
        <StatusChip spec={CHIPS.low} d={d} />
        <StatusChip spec={CHIPS.none} d={d} />
        <StatusChip spec={CHIPS.transit} d={d} />
        <StatusChip spec={CHIPS.toResolve} d={d} />
      </div>
    </div>
  );
}
