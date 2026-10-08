import Link from "next/link";
import { AlertTriangle, FileText, PackageCheck, Pencil } from "lucide-react";
import { canAccess } from "@/lib/access";
import { formatDateTime } from "@/lib/dates";
import { requirePageAccess } from "@/modules/auth";
import { loadTransfer } from "../load-transfer";
import { AutoRefresh } from "@/components/stock/auto-refresh";
import { RESOLUTION_SHORT } from "@/components/transfers/labels";
import { ResolvePanel } from "@/components/transfers/resolve-panel";
import { SendTransferButton } from "@/components/transfers/send-button";
import { TransferStatusBadge } from "@/components/transfers/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimeWithSeconds } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function TransferDetailPage({ params }: PageProps<"/traslados/[id]">) {
  const user = await requirePageAccess(["ADMIN", "VENDEDORA", "BODEGA"]);
  const t = await loadTransfer(params);

  const roles = ["ADMIN", "VENDEDORA", "BODEGA"] as const;
  const canSend = canAccess(user, { roles, locationId: t.fromLocation.id });
  const canReceive = canAccess(user, { roles, locationId: t.toLocation.id });
  const isAdmin = user.role === "ADMIN";
  const hasDifferences = t.lines.some((l) => l.qtyReceived !== null && l.qtyReceived !== l.qtySent);
  const units = t.lines.reduce((a, l) => a + l.qtySent, 0);
  const linked = t.lines.some((l) => l.linked);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/traslados" className="text-sm text-brand-ink underline-offset-4 hover:underline">
            ← Traslados
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            <span className="font-mono" data-testid="transfer-number">
              {t.number}
            </span>
            <TransferStatusBadge status={t.status} />
          </h1>
          <p className="text-sm">
            {t.fromLocation.name} <span aria-hidden>→</span> <span className="sr-only">hacia</span> {t.toLocation.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AutoRefresh renderedAt={formatTimeWithSeconds(new Date())} />
          {t.status !== "ANULADO" && (
            <Link href={`/traslados/${t.id}/guia`} className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 px-4" })}>
              <FileText /> Guía
            </Link>
          )}
        </div>
      </div>

      {t.overdue && (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-900" data-testid="overdue-alert">
          <AlertTriangle className="size-4" aria-hidden /> Lleva {t.daysInTransit} días en tránsito (alerta desde {t.alertDays}). Revisa si ya llegó.
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Creado">
          {formatDateTime(t.createdAt)} · {t.createdByName}
        </Meta>
        <Meta label="Enviado">{t.sentAt ? `${formatDateTime(t.sentAt)} · ${t.sentByName}` : "—"}</Meta>
        <Meta label="Recibido">{t.receivedAt ? `${formatDateTime(t.receivedAt)} · ${t.receivedByName}` : "—"}</Meta>
        <Meta label="Resuelto">{t.resolvedAt ? `${formatDateTime(t.resolvedAt)} · ${t.resolvedByName}` : "—"}</Meta>
        {t.resolutionNotes && (
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-xs text-muted-foreground">Notas</dt>
            <dd className="text-sm whitespace-pre-line" data-testid="resolution-notes">
              {t.resolutionNotes}
            </dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap items-start gap-3">
        {t.status === "BORRADOR" && canSend && !linked && (
          <>
            <SendTransferButton transferId={t.id} number={t.number} fromName={t.fromLocation.name} units={units} />
            <Link href={`/traslados/${t.id}/editar`} className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 px-4" })}>
              <Pencil /> Editar o anular
            </Link>
          </>
        )}
        {t.status === "BORRADOR" && !canSend && (
          <p className="text-sm text-muted-foreground">Lo envía {t.fromLocation.name}.</p>
        )}
        {t.status === "EN_TRANSITO" && canReceive && (
          <Link href={`/traslados/${t.id}/recibir`} className={buttonVariants({ size: "lg", className: "h-11 px-4" })}>
            <PackageCheck /> Recibir escaneando
          </Link>
        )}
        {t.status === "EN_TRANSITO" && !canReceive && (
          <p className="text-sm text-muted-foreground">Lo recibe {t.toLocation.name}.</p>
        )}
        {t.status === "RECIBIDO_CON_DIFERENCIAS" && !isAdmin && (
          <p className="text-sm font-medium text-amber-800">Hay diferencias: las resuelve Belén.</p>
        )}
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Prenda</TableHead>
              <TableHead className="text-center">Enviado</TableHead>
              <TableHead className="text-center">Recibido</TableHead>
              <TableHead>Diferencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {t.lines.map((l) => {
              const diff = l.qtyReceived === null ? null : l.qtyReceived - l.qtySent;
              return (
                <TableRow key={l.id} data-testid="detail-line">
                  <TableCell className="font-mono text-xs">
                    <Link href={`/stock/${l.variantId}/kardex`} className="text-brand-ink underline-offset-4 hover:underline">
                      {l.sku}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {l.productName} · {l.color} · T{l.size}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{l.qtySent}</TableCell>
                  <TableCell className="text-center tabular-nums">{l.qtyReceived ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {diff === null || diff === 0 ? (
                      <span className="text-muted-foreground">{diff === 0 ? "Cuadra" : "—"}</span>
                    ) : (
                      <span className={cn("font-medium", l.differenceResolution ? "text-muted-foreground" : "text-amber-800")}>
                        {diff < 0 ? `Faltan ${-diff}` : `Sobran ${diff}`}
                        {l.differenceResolution && ` · ${RESOLUTION_SHORT[l.differenceResolution]}`}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {isAdmin && hasDifferences && (t.status === "RECIBIDO_CON_DIFERENCIAS" || t.status === "CERRADO") && (
        <ResolvePanel
          transferId={t.id}
          lines={t.lines
            .filter((l) => l.qtyReceived !== null && l.qtyReceived !== l.qtySent)
            .map((l) => ({
              lineId: l.id,
              sku: l.sku,
              description: `${l.productName} · ${l.color} · T${l.size}`,
              qtySent: l.qtySent,
              qtyReceived: l.qtyReceived!,
              resolution: l.differenceResolution,
              originName: t.fromLocation.name,
            }))}
        />
      )}
    </div>
  );
}
