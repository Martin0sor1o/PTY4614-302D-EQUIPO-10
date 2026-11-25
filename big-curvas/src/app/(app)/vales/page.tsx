import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { CircleCheck, CircleX, TimerOff, Wallet, type LucideIcon } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatCLP } from "@/lib/money";
import { requirePageAccess } from "@/modules/auth";
import { getVoucherLedger, listVouchers, type VoucherStatus } from "@/modules/vouchers";
import { Assumption } from "@/components/ui/assumption";
import { DeactivateVoucher } from "@/components/vouchers/deactivate-voucher";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vales" };

// Vista de Belén: los vales emitidos por devoluciones y cambios (ADR-021, RF-DEV-06). Solo ADMIN. El estado se calcula.

const STATUS: Record<VoucherStatus, { label: string; tone: StatusTone; icon: LucideIcon }> = {
  VIGENTE: { label: "Vigente", tone: "ok", icon: CircleCheck },
  AGOTADO: { label: "Agotado", tone: "neutral", icon: Wallet },
  VENCIDO: { label: "Vencido", tone: "warn", icon: TimerOff },
  INACTIVO: { label: "Desactivado", tone: "danger", icon: CircleX },
};

const FILTERS = [
  { id: "VIGENTE", label: "Vigentes" },
  { id: "AGOTADO", label: "Agotados" },
  { id: "VENCIDO", label: "Vencidos" },
  { id: "INACTIVO", label: "Desactivados" },
  { id: "TODOS", label: "Todos" },
] as const;

const MOVEMENT_LABEL = { EMISION: "Emisión", CANJE: "Canje en una venta", REPOSICION: "Reposición (venta anulada)" } as const;

const searchSchema = z.object({
  estado: z.enum(["VIGENTE", "AGOTADO", "VENCIDO", "INACTIVO", "TODOS"]).catch("VIGENTE"),
  vale: z.string().max(64).optional().catch(undefined),
});

export default async function VouchersPage({ searchParams }: PageProps<"/vales">) {
  const user = await requirePageAccess(["ADMIN"]);
  const { estado, vale } = searchSchema.parse(await searchParams);
  const vouchers = await listVouchers({ actor: user, status: estado });
  const detail = vale ? await getVoucherLedger(user, vale).catch(() => null) : null;
  const href = (e: string, v?: string) => `/vales?estado=${e}${v ? `&vale=${v}` : ""}`;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Vales</h1>
        <p className="text-sm text-muted-foreground">
          Saldo a favor que se entrega en una devolución o un cambio. Vencen a los 90 días <Assumption id="S-08" />, no son nominativos y se pueden usar de a poco.
        </p>
      </div>

      <nav aria-label="Estado" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={href(f.id)}
            aria-current={f.id === estado ? "page" : undefined}
            className={cn(
              "flex items-center rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors max-md:min-h-11",
              f.id === estado ? "border-brand-black bg-brand-black text-brand-pink" : "border-input bg-card hover:bg-secondary",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-label="Vales" className="overflow-x-auto rounded-3xl border bg-card shadow-soft">
          {vouchers.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground" data-testid="no-vouchers">
              No hay vales en este estado.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  <th className="px-3 py-2 text-right font-medium">Inicial</th>
                  <th className="px-3 py-2 font-medium">Vence</th>
                  <th className="px-3 py-2 font-medium">Emitido en</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => {
                  const st = STATUS[v.status];
                  return (
                    <tr key={v.id} className={cn("border-b last:border-0", detail?.voucher.id === v.id && "bg-secondary")}>
                      <td className="px-3 py-2">
                        <Link href={href(estado, v.id)} className="font-mono font-semibold underline-offset-2 hover:underline" data-testid="voucher-link">
                          {v.code}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={st.tone} icon={st.icon}>
                          {st.label}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCLP(v.balance)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{formatCLP(v.initialAmount)}</td>
                      <td className="px-3 py-2">{formatDate(v.expiresAt)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {v.issuedLocationName} · {formatDate(v.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <aside aria-label="Detalle del vale" className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          {detail ? (
            <div className="space-y-3 rounded-3xl border bg-card p-4 shadow-soft" data-testid="voucher-detail">
              <div>
                <p className="font-mono text-lg font-bold">{detail.voucher.code}</p>
                <p className="text-sm text-muted-foreground">
                  {STATUS[detail.voucher.status].label} · saldo {formatCLP(detail.voucher.balance)} de {formatCLP(detail.voucher.initialAmount)} · vence {formatDate(detail.voucher.expiresAt)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Emitido por {detail.voucher.createdByName} en {detail.voucher.issuedLocationName} el {formatDateTime(detail.voucher.createdAt)}
                </p>
              </div>
              <h2 className="text-sm font-bold">Movimientos</h2>
              <ul className="divide-y text-sm">
                {detail.movements.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-2 py-1.5">
                    <span>
                      {MOVEMENT_LABEL[m.type]}
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(m.createdAt)} · {m.userName}
                      </span>
                    </span>
                    <span className="text-right tabular-nums">
                      <span className={cn("block font-semibold", m.amount < 0 && "text-tone-danger")}>
                        {m.amount > 0 ? "+" : ""}
                        {formatCLP(m.amount)}
                      </span>
                      <span className="text-xs text-muted-foreground">saldo {formatCLP(m.balanceAfter)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {detail.voucher.active && <DeactivateVoucher voucherId={detail.voucher.id} code={detail.voucher.code} />}
            </div>
          ) : (
            <p className="rounded-3xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">Elige un vale para ver sus movimientos.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
