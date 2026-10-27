import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReportChannel, ReportGroupBy } from "@/modules/reports";
import type { ReportTabId } from "./report-tabs";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

/** Filtro por GET (sin JavaScript): rango de días de Chile y, en Ventas, canal y agrupación. */
export function RangeFilter({
  tab,
  from,
  to,
  channel,
  groupBy,
}: {
  tab: ReportTabId;
  from: string;
  to: string;
  channel?: ReportChannel;
  groupBy?: ReportGroupBy;
}) {
  return (
    <form method="get" action="/reportes" className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end print:hidden">
      <input type="hidden" name="tab" value={tab} />
      <label className="space-y-1 text-sm font-medium">
        Desde
        <Input type="date" name="desde" defaultValue={from} required className="h-9" />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Hasta
        <Input type="date" name="hasta" defaultValue={to} required className="h-9" />
      </label>
      {channel !== undefined && (
        <label className="space-y-1 text-sm font-medium">
          Canal
          <select name="canal" defaultValue={channel} className={selectClass}>
            <option value="todos">Tienda y online</option>
            <option value="tienda">Solo tienda</option>
            <option value="online">Solo online</option>
          </select>
        </label>
      )}
      {groupBy !== undefined && (
        <label className="space-y-1 text-sm font-medium">
          Agrupar por
          <select name="agrupar" defaultValue={groupBy} className={selectClass}>
            <option value="day">Día</option>
            <option value="week">Semana (lun a dom)</option>
            <option value="month">Mes</option>
          </select>
        </label>
      )}
      <Button type="submit" size="lg" className="col-span-2 h-9 px-4 lg:col-span-1">
        Aplicar
      </Button>
    </form>
  );
}
