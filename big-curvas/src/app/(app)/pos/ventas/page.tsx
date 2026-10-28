import type { Metadata } from "next";
import { formatTime } from "@/lib/dates";
import { formatCLP } from "@/lib/money";
import { demoPinHint } from "@/modules/demo";
import { listSalesOfDay } from "@/modules/sales";
import { METHOD_LABEL } from "@/components/pos/ticket";
import { DaySalesTable, type DaySaleRow } from "@/components/pos/day-sales-table";
import { Card, CardContent } from "@/components/ui/card";
import { posPageContext } from "../context";

export const dynamic = "force-dynamic";

const METHOD_ORDER = ["EFECTIVO", "DEBITO", "CREDITO", "TRANSFERENCIA"] as const;

export const metadata: Metadata = { title: "Ventas del día" };

export default async function DaySalesPage() {
  const { user, location, problem } = await posPageContext();
  if (problem || !location) return problem;

  const day = await listSalesOfDay({ actor: user, locationId: location.id });
  const rows: DaySaleRow[] = day.sales.map((s) => ({
    id: s.id,
    number: s.number,
    time: formatTime(s.createdAt),
    sellerName: s.sellerName,
    units: s.lines.reduce((a, l) => a + l.quantity, 0),
    methods: s.payments.map((p) => METHOD_LABEL[p.method]).join(" + "),
    total: s.total,
    collected: s.payments.reduce((a, p) => a + p.amount, 0),
    voided: s.voided ? { reason: s.voided.reason, byName: s.voided.byName, time: formatTime(s.voided.at) } : null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ventas del día · {location.name}</h1>
        <p className="text-sm text-muted-foreground">
          Día calendario en hora de Chile. Los totales por medio de pago son lo cobrado (efectivo ya con redondeo y sin vuelto); las ventas anuladas no suman. Solo se
          anulan ventas del mismo día, con aprobación de Belén.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {METHOD_ORDER.map((m) => (
          <Card key={m} size="sm">
            <CardContent>
              <div className="text-xs font-bold tracking-wider text-muted-foreground uppercase">{METHOD_LABEL[m]}</div>
              <div className="text-xl font-bold tabular-nums" data-testid={`total-${m}`}>
                {formatCLP(day.totalsByMethod[m])}
              </div>
            </CardContent>
          </Card>
        ))}
        <Card size="sm" className="border-brand-black">
          <CardContent>
            <div className="text-xs font-bold tracking-wider text-muted-foreground uppercase">Total del día · {day.count} {day.count === 1 ? "venta" : "ventas"}</div>
            <div className="text-xl font-bold tabular-nums" data-testid="total-day">
              {formatCLP(day.totalCollected)}
            </div>
          </CardContent>
        </Card>
      </div>

      <DaySalesTable rows={rows} isAdmin={user.role === "ADMIN"} demoPinHint={demoPinHint()} />
    </div>
  );
}
