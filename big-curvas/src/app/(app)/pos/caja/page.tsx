import Link from "next/link";
import { z } from "zod";
import { formatDateTime, formatTime } from "@/lib/dates";
import { isAppError } from "@/lib/errors";
import { formatCLP } from "@/lib/money";
import { getCashClosingTotals, getCashSession, getOpenCashSession } from "@/modules/sales";
import { CloseCashForm, OpenCashForm } from "@/components/pos/cash-forms";
import { METHOD_LABEL } from "@/components/pos/ticket";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { posPageContext } from "../context";

export const dynamic = "force-dynamic";

const searchSchema = z.object({ cerrada: z.string().max(64).optional().catch(undefined) });

async function ClosedSummary({ sessionId }: { sessionId: string }) {
  const { user } = await posPageContext();
  let session;
  try {
    session = await getCashSession(user, sessionId);
  } catch (error) {
    if (isAppError(error)) return null; // otra tienda o inexistente: no se muestra
    throw error;
  }
  if (session.status !== "CERRADA") return null;
  const totals = await getCashClosingTotals(user, sessionId);
  const diff = session.difference ?? 0;
  return (
    <Card className="border-brand-black" data-testid="closed-summary">
      <CardHeader>
        <CardTitle>Caja cerrada · {formatDateTime(session.closedAt!)}</CardTitle>
        <CardDescription>
          Abierta el {formatDateTime(session.openedAt)} por {session.openedByName} · cerrada por {session.closedByName} · {totals.salesCount}{" "}
          {totals.salesCount === 1 ? "venta" : "ventas"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt>Monto inicial</dt>
          <dd className="text-right tabular-nums">{formatCLP(session.openingCash)}</dd>
          <dt>+ Efectivo cobrado (sin vueltos, con redondeo)</dt>
          <dd className="text-right tabular-nums">{formatCLP(totals.cashCollected)}</dd>
          <dt className="border-t pt-1 font-medium">Efectivo esperado</dt>
          <dd className="border-t pt-1 text-right font-medium tabular-nums" data-testid="expected-cash">
            {formatCLP(session.expectedCash ?? 0)}
          </dd>
          <dt>Efectivo contado</dt>
          <dd className="text-right tabular-nums" data-testid="counted-cash">
            {formatCLP(session.countedCash ?? 0)}
          </dd>
          <dt className="font-semibold">Diferencia</dt>
          <dd
            className={cn("text-right text-lg font-bold tabular-nums", diff === 0 ? "text-emerald-700" : "text-red-700")}
            data-testid="cash-difference"
          >
            {diff === 0 ? "Cuadra ($0)" : `${diff > 0 ? "+" : ""}${formatCLP(diff)} ${diff > 0 ? "(sobra)" : "(falta)"}`}
          </dd>
        </dl>
        {session.notes && (
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
            <span className="font-medium">Observación:</span> {session.notes}
          </p>
        )}
        <div className="text-sm">
          <div className="mb-1 font-medium">Cobrado por medio de pago</div>
          <ul className="grid max-w-md grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-4">
            {(["EFECTIVO", "DEBITO", "CREDITO", "TRANSFERENCIA"] as const).map((m) => (
              <li key={m}>
                <span className="text-muted-foreground">{METHOD_LABEL[m]}</span>
                <div className="font-medium tabular-nums">{formatCLP(totals.byMethod[m])}</div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function CashPage({ searchParams }: PageProps<"/pos/caja">) {
  const { user, location, problem } = await posPageContext();
  if (problem || !location) return problem;
  const { cerrada } = searchSchema.parse(await searchParams);
  const session = await getOpenCashSession(user, location.id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Caja · {location.name}</h1>

      {cerrada && <ClosedSummary sessionId={cerrada} />}

      {session ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Caja abierta</CardTitle>
            <CardDescription>
              Desde las {formatTime(session.openedAt)} ({formatDateTime(session.openedAt)}) por {session.openedByName} · monto inicial{" "}
              {formatCLP(session.openingCash)} · {session.salesCount} {session.salesCount === 1 ? "venta" : "ventas"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href="/pos" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-4")}>
              Volver a vender
            </Link>
            <div className="border-t pt-4">
              <h2 className="mb-3 font-semibold">Cerrar caja</h2>
              <CloseCashForm locationName={location.name} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Abrir caja</CardTitle>
            <CardDescription>No se puede vender sin caja abierta. Hay una sola caja por tienda.</CardDescription>
          </CardHeader>
          <CardContent>
            <OpenCashForm locationName={location.name} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
