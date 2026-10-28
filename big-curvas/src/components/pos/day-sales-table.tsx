"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { requestVoidApprovalAction, voidSaleAction, type ApprovalLite } from "@/app/(app)/pos/approvals-actions";
import { ApprovalWait } from "@/components/approvals/approval-wait";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCLP } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface DaySaleRow {
  id: string;
  number: string;
  time: string;
  sellerName: string;
  units: number;
  methods: string;
  total: number;
  collected: number;
  voided: { reason: string | null; byName: string | null; time: string } | null;
}

/**
 * Anular una venta del día (RN-12). La vendedora la pide y la ejecuta sola cuando Belén aprueba (RF-AUT-03);
 * Belén (ADMIN) la anula directo, sin solicitud, y queda en audit_log.
 */
function VoidPanel({ row, isAdmin, demoPinHint, onClose }: { row: DaySaleRow; isAdmin: boolean; demoPinHint: string | null; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [approval, setApproval] = useState<ApprovalLite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const requestKey = useRef(crypto.randomUUID());
  const voidKey = useRef(crypto.randomUUID());
  const executing = useRef(false);

  function execute(approvalId?: string) {
    if (executing.current) return;
    executing.current = true;
    setError(null);
    startTransition(async () => {
      const res = await voidSaleAction({ saleId: row.id, reason: reason.trim() || "Anulación aprobada", approvalId, idempotencyKey: voidKey.current });
      executing.current = false;
      if (!res.ok) return setError(res.message);
      setDone(`La venta ${res.number} quedó anulada y el stock se repuso.`);
      router.refresh();
    });
  }

  function request() {
    setError(null);
    if (reason.trim().length < 3) return setError("Escribe el motivo de la anulación.");
    startTransition(async () => {
      const res = await requestVoidApprovalAction({ saleId: row.id, reason: reason.trim(), idempotencyKey: requestKey.current });
      if (!res.ok) return setError(res.message);
      setApproval(res.approval);
    });
  }

  if (done) {
    return (
      <Notice tone="ok" role="status" data-testid="void-done">
        {done}
      </Notice>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-secondary p-3" data-testid="void-panel">
      <p className="text-sm font-bold">
        Anular la venta {row.number} · {formatCLP(row.collected)}
      </p>
      {!approval ? (
        <>
          <div className="space-y-1">
            <Label htmlFor={`void-reason-${row.id}`}>Motivo *</Label>
            <Textarea id={`void-reason-${row.id}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. error al cobrar, la clienta devolvió todo…" />
          </div>
          <p className="text-xs text-muted-foreground">
            {isAdmin
              ? "Como administradora la anulas directamente: no necesita solicitud, pero queda registrada. La prenda vuelve al stock."
              : "Se la pides a Belén. Si la aprueba, se anula sola, la prenda vuelve al stock y, si fue en efectivo, el dinero sale de la caja abierta."}
          </p>
          {error && (
            <Notice tone="danger" role="alert" className="py-2">
              {error}
            </Notice>
          )}
          <div className="flex gap-2">
            {isAdmin ? (
              <Button
                type="button"
                className="bg-tone-danger text-white hover:bg-tone-danger/90"
                disabled={pending}
                onClick={() => {
                  if (reason.trim().length < 3) return setError("Escribe el motivo de la anulación.");
                  if (window.confirm(`¿Anular la venta ${row.number}? La prenda vuelve al stock.`)) execute();
                }}
              >
                {pending ? "Anulando…" : "Anular venta"}
              </Button>
            ) : (
              <Button type="button" disabled={pending} onClick={request} data-testid="ask-void">
                {pending ? "Enviando…" : "Pedir aprobación a Belén"}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <>
          <ApprovalWait
            approval={approval}
            onStatus={(a) => {
              setApproval(a);
              if (a.status === "APROBADA") execute(a.id); // la caja continúa sola al aprobarse
            }}
            onClose={() => (approval.status === "PENDIENTE" ? onClose() : (setApproval(null), requestKey.current = crypto.randomUUID()))}
            closeLabel={approval.status === "PENDIENTE" ? "Cancelar espera" : "Entendido"}
            demoPinHint={demoPinHint}
          />
          {approval.status === "APROBADA" && (
            <div className="space-y-1">
              {pending && <p className="text-sm text-muted-foreground">Anulando la venta…</p>}
              {error && (
                <div role="alert" className="space-y-2">
                  <Notice tone="danger" className="py-2">
                    {error}
                  </Notice>
                  <Button type="button" size="sm" onClick={() => execute(approval.id)} disabled={pending}>
                    Reintentar anulación
                  </Button>
                  <p className="text-xs text-muted-foreground">La aprobación sigue vigente mientras no venza.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function DaySalesTable({ rows, isAdmin, demoPinHint }: { rows: DaySaleRow[]; isAdmin: boolean; demoPinHint: string | null }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="rounded-3xl border bg-card shadow-soft">
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
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                Aún no hay ventas hoy.
              </TableCell>
            </TableRow>
          )}
          {rows.map((s) => (
            <Fragment key={s.id}>
              <TableRow data-testid="day-sale" data-voided={s.voided ? "true" : undefined} className={cn(s.voided && "bg-tone-danger-soft/60 text-muted-foreground")}>
                <TableCell className="font-mono">
                  <Link href={`/pos/ticket/${s.id}`} className="text-brand-ink underline-offset-4 hover:underline">
                    {s.number}
                  </Link>
                  {s.voided && (
                    <StatusBadge tone="danger" icon={Ban} className="ml-2 font-sans" data-testid="voided-badge">
                      Anulada
                    </StatusBadge>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{s.time}</TableCell>
                <TableCell>{s.sellerName}</TableCell>
                <TableCell className="text-center tabular-nums">{s.units}</TableCell>
                <TableCell>{s.methods}</TableCell>
                <TableCell className={cn("text-right tabular-nums", s.voided && "line-through")}>{formatCLP(s.total)}</TableCell>
                <TableCell className={cn("text-right font-medium tabular-nums", s.voided && "line-through")}>{formatCLP(s.collected)}</TableCell>
                <TableCell className="text-right">
                  {s.voided ? (
                    <span className="text-xs">
                      {s.voided.byName} · {s.voided.time}
                    </span>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => setOpenId(openId === s.id ? null : s.id)} data-testid="void-button">
                      Anular
                    </Button>
                  )}
                </TableCell>
              </TableRow>
              {s.voided?.reason && (
                <TableRow>
                  <TableCell colSpan={8} className="py-1 text-xs text-muted-foreground">
                    Motivo de la anulación: {s.voided.reason}
                  </TableCell>
                </TableRow>
              )}
              {openId === s.id && !s.voided && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <VoidPanel row={s} isAdmin={isAdmin} demoPinHint={demoPinHint} onClose={() => setOpenId(null)} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
