import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { z } from "zod";
import { requirePageAccess } from "@/modules/auth";
import { countPendingTransfers, listTransfers, type TransferBucket, type TransferListItem } from "@/modules/inventory";
import { formatDateTime, formatTimeWithSeconds } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "@/components/stock/auto-refresh";
import { TransferStatusBadge } from "@/components/transfers/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const BUCKETS = ["por-enviar", "por-recibir", "con-diferencias", "historial"] as const;
const searchSchema = z.object({ tab: z.enum(BUCKETS).optional().catch(undefined) });

const TAB_LABEL: Record<TransferBucket, string> = {
  "por-enviar": "Por enviar",
  "por-recibir": "Por recibir",
  "con-diferencias": "Con diferencias",
  historial: "Historial",
};

const EMPTY: Record<TransferBucket, string> = {
  "por-enviar": "No hay borradores por enviar desde esta ubicación.",
  "por-recibir": "No hay traslados en camino hacia esta ubicación.",
  "con-diferencias": "No hay diferencias por resolver.",
  historial: "Todavía no hay traslados en el historial.",
};

function Row({ t, bucket }: { t: TransferListItem; bucket: TransferBucket }) {
  const href = bucket === "por-recibir" ? `/traslados/${t.id}/recibir` : `/traslados/${t.id}`;
  const cta = { "por-enviar": "Abrir", "por-recibir": "Recibir", "con-diferencias": "Resolver", historial: "Ver" }[bucket];
  return (
    <TableRow data-testid="transfer-row" data-overdue={t.overdue || undefined}>
      <TableCell className="font-mono text-xs">
        <Link href={`/traslados/${t.id}`} className="text-brand-ink underline-offset-4 hover:underline">
          {t.number}
        </Link>
      </TableCell>
      <TableCell>
        {t.fromLocationName} <span aria-hidden>→</span> <span className="sr-only">hacia</span> {t.toLocationName}
      </TableCell>
      <TableCell className="text-center tabular-nums">
        {t.unitsSent}
        <div className="text-xs text-muted-foreground">
          {t.lineCount} {t.lineCount === 1 ? "prenda" : "prendas"}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <TransferStatusBadge status={t.status} />
          {t.overdue && (
            <StatusBadge tone="danger" icon={AlertTriangle} data-testid="overdue-alert">
              {t.daysInTransit} días en tránsito
            </StatusBadge>
          )}
          {t.status === "RECIBIDO_CON_DIFERENCIAS" && (
            <StatusBadge tone="violet">{t.unresolvedLines} por resolver</StatusBadge>
          )}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
        {formatDateTime(t.receivedAt ?? t.sentAt ?? t.createdAt)}
      </TableCell>
      <TableCell className="text-right">
        <Link href={href} className={buttonVariants({ variant: bucket === "por-recibir" ? "default" : "outline", size: "sm" })}>
          {cta}
        </Link>
      </TableCell>
    </TableRow>
  );
}

/** Celular (bajo md): una tarjeta por traslado (sin scroll horizontal). */
function TransferCard({ t, bucket }: { t: TransferListItem; bucket: TransferBucket }) {
  const href = bucket === "por-recibir" ? `/traslados/${t.id}/recibir` : `/traslados/${t.id}`;
  const cta = { "por-enviar": "Abrir", "por-recibir": "Recibir", "con-diferencias": "Resolver", historial: "Ver" }[bucket];
  return (
    <li className="space-y-2 rounded-2xl border bg-card p-3 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/traslados/${t.id}`} className="inline-flex min-h-11 items-center font-mono text-sm font-semibold whitespace-nowrap text-brand-ink underline-offset-4 hover:underline">
          {t.number}
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2">
          <TransferStatusBadge status={t.status} />
          {t.overdue && (
            <StatusBadge tone="danger" icon={AlertTriangle}>
              {t.daysInTransit} días en tránsito
            </StatusBadge>
          )}
          {t.status === "RECIBIDO_CON_DIFERENCIAS" && <StatusBadge tone="violet">{t.unresolvedLines} por resolver</StatusBadge>}
        </div>
      </div>
      <div>
        <div className="font-semibold">
          {t.fromLocationName} <span aria-hidden>→</span> <span className="sr-only">hacia</span> {t.toLocationName}
        </div>
        <div className="text-sm text-muted-foreground tabular-nums">
          {t.unitsSent} unidades · {t.lineCount} {t.lineCount === 1 ? "prenda" : "prendas"} · {formatDateTime(t.receivedAt ?? t.sentAt ?? t.createdAt)}
        </div>
      </div>
      <Link href={href} className={buttonVariants({ variant: bucket === "por-recibir" ? "default" : "outline", className: "w-full" })}>
        {cta}
      </Link>
    </li>
  );
}

export const metadata: Metadata = { title: "Traslados" };

export default async function TransfersPage({ searchParams }: PageProps<"/traslados">) {
  const user = await requirePageAccess(["ADMIN", "VENDEDORA", "BODEGA"]);
  const isAdmin = user.role === "ADMIN";
  const locationId = user.activeLocation?.id;

  const counts = await countPendingTransfers({ locationId, includeDifferences: isAdmin });
  const { tab } = searchSchema.parse(await searchParams);
  const visible = BUCKETS.filter((b) => b !== "con-diferencias" || isAdmin);
  const bucket: TransferBucket = tab && visible.includes(tab) ? tab : counts.porRecibir > 0 ? "por-recibir" : "por-enviar";
  const rows = await listTransfers({ bucket, locationId });
  const badge: Partial<Record<TransferBucket, number>> = {
    "por-enviar": counts.porEnviar,
    "por-recibir": counts.porRecibir,
    "con-diferencias": counts.conDiferencias,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Traslados</h1>
          <p className="text-sm text-muted-foreground">
            Mercadería que va y viene entre la tienda y la bodega.
            {user.activeLocation ? ` Ubicación: ${user.activeLocation.name}.` : " Elige una ubicación en “Operando en” para ver y crear los tuyos."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AutoRefresh renderedAt={formatTimeWithSeconds(new Date())} />
          {user.activeLocation ? (
            <Link href="/traslados/nuevo" className={buttonVariants({ size: "lg", className: "h-11 px-4" })}>
              <Plus /> Nuevo traslado
            </Link>
          ) : null}
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b" aria-label="Bandejas de traslados">
        {visible.map((b) => {
          const active = b === bucket;
          const n = badge[b];
          return (
            <Link
              key={b}
              href={`/traslados?tab=${b}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold max-md:min-h-11",
                active ? "border-brand-ink text-brand-ink" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABEL[b]}
              {n ? (
                <span className="rounded-full bg-brand-black px-1.5 py-0.5 text-xs leading-none text-brand-pink" data-testid={`count-${b}`}>
                  {n}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <ul className="space-y-3 md:hidden" aria-label="Traslados">
        {rows.length === 0 && <li className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">{EMPTY[bucket]}</li>}
        {rows.map((t) => (
          <TransferCard key={t.id} t={t} bucket={bucket} />
        ))}
      </ul>

      <div className="hidden rounded-3xl border bg-card shadow-soft md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Ruta</TableHead>
              <TableHead className="text-center">Unidades</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {EMPTY[bucket]}
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => (
              <Row key={t.id} t={t} bucket={bucket} />
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        “En tránsito” = el stock ya salió del origen y todavía no lo recibe el destino. Se marca en rojo si pasa de los días definidos en la configuración.
      </p>
    </div>
  );
}
