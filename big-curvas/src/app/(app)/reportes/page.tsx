import { z } from "zod";
import { addDaysToKey, santiagoDayKey } from "@/lib/dates";
import { isAppError } from "@/lib/errors";
import { requirePageAccess } from "@/modules/auth";
import {
  getFridayList,
  getLowStock,
  getNoRotation,
  getSalesByPaymentMethod,
  getSalesSummaryCards,
  getTopSellers,
} from "@/modules/reports";
import { FridayTab } from "@/components/reports/friday-tab";
import { LowStockTab } from "@/components/reports/low-stock-tab";
import { NoRotationTab } from "@/components/reports/no-rotation-tab";
import { RangeFilter } from "@/components/reports/range-filter";
import { REPORT_TABS, ReportTabs, type ReportTabId } from "@/components/reports/report-tabs";
import { SalesTab } from "@/components/reports/sales-tab";
import { SummaryCards } from "@/components/reports/summary-cards";
import { TopSellersTab } from "@/components/reports/top-sellers-tab";

export const dynamic = "force-dynamic";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined);
const searchSchema = z.object({
  tab: z.enum(REPORT_TABS.map((t) => t.id) as [ReportTabId, ...ReportTabId[]]).optional().catch(undefined),
  desde: day,
  hasta: day,
  canal: z.enum(["todos", "tienda", "online"]).optional().catch(undefined),
  agrupar: z.enum(["day", "week", "month"]).optional().catch(undefined),
});

/** Errores de validación (rango inválido) se muestran en la pantalla; cualquier otro error sigue su curso. */
async function load<T>(run: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await run() };
  } catch (e) {
    if (isAppError(e) && e.code === "VALIDATION") return { ok: false, error: e.message };
    throw e;
  }
}

function RangeError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </p>
  );
}

/** Reportes y dashboard de Belén (solo ADMIN, solo lectura). El rol se valida aquí y otra vez en cada consulta del módulo. */
export default async function ReportsPage({ searchParams }: PageProps<"/reportes">) {
  const actor = await requirePageAccess(["ADMIN"]);
  const q = searchSchema.parse(await searchParams);
  const tab: ReportTabId = q.tab ?? "ventas";

  const now = new Date();
  const today = santiagoDayKey(now);
  const to = q.hasta ?? today;
  const from = q.desde ?? addDaysToKey(to, -29);
  const channel = q.canal ?? "todos";
  const groupBy = q.agrupar ?? "day";
  const cards = await getSalesSummaryCards({ actor, now });

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">Lo que antes llevabas en el Excel: ventas por medio de pago, lo que más se vende y qué reponer.</p>
      </div>

      <div className="print:hidden">
        <SummaryCards cards={cards} />
      </div>

      <ReportTabs active={tab} query={{ desde: q.desde, hasta: q.hasta, canal: q.canal, agrupar: q.agrupar }} />

      {tab === "ventas" && (
        <div className="space-y-4">
          <RangeFilter tab="ventas" from={from} to={to} channel={channel} groupBy={groupBy} />
          <SalesView actor={actor} from={from} to={to} channel={channel} groupBy={groupBy} />
        </div>
      )}
      {tab === "mas-vendidos" && (
        <div className="space-y-4">
          <RangeFilter tab="mas-vendidos" from={from} to={to} />
          <TopSellersView actor={actor} from={from} to={to} />
        </div>
      )}
      {tab === "stock-bajo" && <LowStockTab report={await getLowStock({ actor })} />}
      {tab === "sin-rotacion" && <NoRotationTab report={await getNoRotation({ actor, now })} />}
      {tab === "viernes" && <FridayTab report={await getFridayList({ actor, now })} generatedAt={now} />}
    </div>
  );
}

type Actor = Awaited<ReturnType<typeof requirePageAccess>>;

async function SalesView({ actor, from, to, channel, groupBy }: { actor: Actor; from: string; to: string; channel: "todos" | "tienda" | "online"; groupBy: "day" | "week" | "month" }) {
  const r = await load(() => getSalesByPaymentMethod({ actor, from, to, channel, groupBy }));
  return r.ok ? <SalesTab report={r.data} /> : <RangeError message={r.error} />;
}

async function TopSellersView({ actor, from, to }: { actor: Actor; from: string; to: string }) {
  const r = await load(() => getTopSellers({ actor, from, to }));
  return r.ok ? <TopSellersTab report={r.data} /> : <RangeError message={r.error} />;
}
