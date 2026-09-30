import Link from "next/link";
import { formatTime } from "@/lib/dates";
import { formatCLP } from "@/lib/money";
import { listSalesOfDay } from "@/modules/sales";
import { METHOD_LABEL } from "@/components/pos/ticket";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { posPageContext } from "../context";

export const dynamic = "force-dynamic";

const METHOD_ORDER = ["EFECTIVO", "DEBITO", "CREDITO", "TRANSFERENCIA"] as const;

export default async function DaySalesPage() {
  const { user, location, problem } = await posPageContext();
  if (problem || !location) return problem;

  const day = await listSalesOfDay({ actor: user, locationId: location.id });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas del día · {location.name}</h1>
        <p className="text-sm text-muted-foreground">Día calendario en hora de Chile. Los totales por medio de pago son lo cobrado (efectivo ya con redondeo y sin vuelto).</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {METHOD_ORDER.map((m) => (
          <Card key={m} size="sm">
            <CardContent>
              <div className="text-xs text-muted-foreground">{METHOD_LABEL[m]}</div>
              <div className="text-xl font-semibold tabular-nums" data-testid={`total-${m}`}>
                {formatCLP(day.totalsByMethod[m])}
              </div>
            </CardContent>
          </Card>
        ))}
        <Card size="sm" className="border-brand-black">
          <CardContent>
            <div className="text-xs text-muted-foreground">Total del día · {day.count} {day.count === 1 ? "venta" : "ventas"}</div>
            <div className="text-xl font-bold tabular-nums" data-testid="total-day">
              {formatCLP(day.totalCollected)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N° venta</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Vendedora</TableHead>
              <TableHead className="text-center">Prendas</TableHead>
              <TableHead>Medio de pago</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Cobrado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {day.sales.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Aún no hay ventas hoy.
                </TableCell>
              </TableRow>
            )}
            {day.sales.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono">
                  <Link href={`/pos/ticket/${s.id}`} className="text-brand-ink underline-offset-4 hover:underline">
                    {s.number}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">{formatTime(s.createdAt)}</TableCell>
                <TableCell>{s.sellerName}</TableCell>
                <TableCell className="text-center tabular-nums">{s.lines.reduce((a, l) => a + l.quantity, 0)}</TableCell>
                <TableCell>{s.payments.map((p) => METHOD_LABEL[p.method]).join(" + ")}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCLP(s.total)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatCLP(s.payments.reduce((a, p) => a + p.amount, 0))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
