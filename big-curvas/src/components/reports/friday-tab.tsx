import { formatDateTime } from "@/lib/dates";
import type { FridayList } from "@/modules/reports";
import { PrintButton } from "@/components/pos/print-button";
import { dayLabel, pluralize } from "./format";
import { Definitions, EmptyState } from "./shared";

/** Lista del viernes: se ve en pantalla y se imprime en A4 (clase `guia`, ver globals.css). No crea el traslado. */
export function FridayTab({ report, generatedAt }: { report: FridayList; generatedAt: Date }) {
  const { rows } = report;
  const route = report.from && report.to ? `${report.from.name} → ${report.to.name}` : "Bodega → Tienda";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground" data-testid="friday-summary">
          Qué llevar de la bodega a la tienda según lo que la tienda vendió entre el {dayLabel(report.fromDay)} y el {dayLabel(report.toDay)} ({report.days} días).
        </p>
        {rows.length > 0 && <PrintButton />}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No hay nada que sugerir este viernes">
          La tienda no vendió prendas que la bodega pueda reponer, o ya tiene disponible lo que vendió. Aparece aquí cuando una prenda vendida en la tienda
          se está acabando y hay disponible en la bodega.
        </EmptyState>
      ) : (
        <article className="guia w-full overflow-x-auto bg-white p-4 text-black shadow-sm ring-1 ring-black/10 sm:p-6" aria-label="Lista sugerida del viernes">
          <header className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-black pb-3">
            <div>
              <div className="text-2xl font-extrabold tracking-[0.12em]">BIG CURVAS</div>
              <div className="text-sm">Lista sugerida del viernes · {route}</div>
            </div>
            <div className="text-right text-sm">
              <div>Ventas de la tienda: {dayLabel(report.fromDay)} al {dayLabel(report.toDay)}</div>
              <div className="text-neutral-600">Generada {formatDateTime(generatedAt)}</div>
            </div>
          </header>

          <table className="mt-3 w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-y-2 border-black text-left">
                <th className="py-1.5 pr-2">SKU / prenda</th>
                <th className="py-1.5 pr-2">Talla</th>
                <th className="py-1.5 pr-2 text-right">Vendió</th>
                <th className="py-1.5 pr-2 text-right">En tienda</th>
                <th className="py-1.5 pr-2 text-right">En bodega</th>
                <th className="py-1.5 pr-2 text-right">Llevar</th>
                <th className="w-14 py-1.5 text-center">Ok</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.variantId} className="border-b border-neutral-400" data-testid="friday-row">
                  <td className="py-1.5 pr-2">
                    <div className="font-medium">{r.productName} · {r.color}</div>
                    <div className="font-mono text-xs text-neutral-600">{r.sku}</div>
                    {r.inTransitToStore > 0 && (
                      <div className="text-xs text-neutral-600">Ya en camino a la tienda: {r.inTransitToStore} (no se resta)</div>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">{r.size}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.sold}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.storeAvailable}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.warehouseAvailable}</td>
                  <td className="py-1.5 pr-2 text-right text-base font-bold tabular-nums">{r.suggested}</td>
                  <td className="py-1.5">
                    <span className="mx-auto block h-5 w-8 border border-neutral-500" aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black font-semibold">
                <td colSpan={5} className="py-1.5">
                  Total ({pluralize(rows.length, "prenda", "prendas")})
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums" data-testid="friday-total">
                  {report.totalUnits}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          <p className="mt-3 text-xs text-neutral-600">Sugerencia: no crea el traslado ni mueve stock. “En bodega” es lo disponible (sin lo reservado para pedidos).</p>
        </article>
      )}

      <Definitions>
        <li>
          Llevar = lo menor entre lo disponible en bodega y lo que falta en la tienda (lo que vendió en los últimos {report.days} días menos lo que aún tiene disponible). Los días están en la configuración
          (propuesta: 14).
        </li>
        <li>Disponible = en mano − reservado: lo reservado para pedidos online nunca se sugiere. No cuentan ventas anuladas ni de pedidos cancelados.</li>
        <li>Supuesto: lo que ya viaja a la tienda se muestra, pero no se resta; si hay un traslado en camino, revisa antes de duplicarlo.</li>
        <li>Es solo una lista para mirar e imprimir. Para mover la mercadería, crea el traslado en Traslados.</li>
      </Definitions>
    </div>
  );
}
