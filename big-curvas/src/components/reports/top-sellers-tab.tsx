import { formatCLP } from "@/lib/money";
import type { TopSellers } from "@/modules/reports";
import { barPercent, dayLabel, pluralize } from "./format";
import { Definitions, EmptyState } from "./shared";

export function TopSellersTab({ report }: { report: TopSellers }) {
  const { models } = report;
  const maxUnits = Math.max(0, ...models.map((m) => m.units));

  return (
    <div className="space-y-4">
      {models.length === 0 ? (
        <EmptyState title="No hay ventas en este rango">Prueba con otras fechas. Las ventas anuladas y los pedidos cancelados no se cuentan.</EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="top-summary">
            {dayLabel(report.from)} al {dayLabel(report.to)} · {pluralize(report.totalModels, "modelo", "modelos")} · {pluralize(report.totalUnits, "unidad", "unidades")} ·{" "}
            {formatCLP(report.totalRevenue)}
            {report.totalModels > models.length ? ` · se muestran los primeros ${models.length}` : ""}
          </p>
          <ol className="space-y-2">
            {models.map((m, i) => (
              <li key={m.productId} className="rounded-2xl border bg-card shadow-soft" data-testid="top-model">
                <details>
                  <summary className="grid cursor-pointer grid-cols-[2rem_1fr_auto] max-md:min-h-11 items-center gap-x-3 gap-y-1 px-4 py-3">
                    <span className="text-xl font-bold text-primary tabular-nums" aria-label={`Puesto ${m.rank}`}>
                      {m.rank}
                      {i > 0 && models[i - 1].rank === m.rank && <span className="sr-only"> (empate)</span>}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{m.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{m.modelCode}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums">{pluralize(m.units, "unidad", "unidades")}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">{formatCLP(m.revenue)}</span>
                    </span>
                    <span className="col-span-3 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${barPercent(m.units, maxUnits)}%` }} />
                    </span>
                  </summary>
                  <table className="w-full border-t text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="px-4 py-1.5 font-medium">Variante</th>
                        <th className="px-2 py-1.5 text-right font-medium">Unid.</th>
                        <th className="px-4 py-1.5 text-right font-medium">Ingreso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.variants.map((v) => (
                        <tr key={v.variantId} className="border-t">
                          <td className="px-4 py-1.5">
                            <span className="font-mono text-xs">{v.sku}</span>
                            <span className="text-xs text-muted-foreground"> · {v.color} · talla {v.size}</span>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{v.units}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums">{formatCLP(v.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </li>
            ))}
          </ol>
        </>
      )}

      <Definitions>
        <li>Ranking de modelos por unidades vendidas; si empatan, por ingreso. Los que empatan en ambos comparten puesto. Toca un modelo para ver sus variantes.</li>
        <li>Ingreso = venta de la prenda ya con su descuento, sin el envío. Cuentan tienda y online.</li>
        <li>No cuentan las ventas anuladas ni las de pedidos cancelados (esa prenda nunca salió, aunque el reembolso esté pendiente).</li>
      </Definitions>
    </div>
  );
}
