import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requirePageAccess } from "@/modules/auth";
import { getKardex, type MovementType, type RefType } from "@/modules/inventory";
import { listLocations } from "@/modules/locations";
import { formatDateTime, formatTimeWithSeconds } from "@/lib/dates";
import { isAppError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "@/components/stock/auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const MOVEMENT_LABEL: Record<MovementType, string> = {
  CARGA_INICIAL: "Carga inicial",
  RECEPCION: "Recepción",
  VENTA_POS: "Venta POS",
  VENTA_ONLINE: "Venta online",
  DEVOLUCION: "Devolución",
  ANULACION_VENTA: "Anulación de venta",
  AJUSTE: "Ajuste",
  AJUSTE_CONTEO: "Ajuste por conteo",
  MERMA: "Merma",
  TRASPASO_SALIDA: "Traslado (salida)",
  TRASPASO_ENTRADA: "Traslado (entrada)",
  MERMA_TRASPASO: "Merma de traslado",
  REINGRESO_PEDIDO_CANCELADO: "Reingreso pedido cancelado",
  VENTA_CONTINGENCIA: "Venta en contingencia",
};

const REF_LABEL: Record<RefType, string> = {
  SALE: "Venta",
  RETURN: "Devolución",
  ONLINE_ORDER: "Pedido",
  GOODS_RECEIPT: "Recepción",
  STOCK_COUNT: "Conteo",
  TRANSFER: "Traslado",
  MANUAL: "Manual",
};

const paramsSchema = z.object({ variantId: z.string().min(1).max(64) });
const searchSchema = z.object({ ubicacion: z.string().max(64).optional().catch(undefined) });

export default async function KardexPage({ params, searchParams }: PageProps<"/stock/[variantId]/kardex">) {
  await requirePageAccess(["ADMIN", "VENDEDORA", "BODEGA"]);
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const { ubicacion } = searchSchema.parse(await searchParams);

  const locations = await listLocations();
  const locationId = locations.find((l) => l.id === ubicacion)?.id;

  let kardex;
  try {
    kardex = await getKardex({ variantId: parsed.data.variantId, locationId });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const { variant, stock, inTransit, movements } = kardex;
  const base = `/stock/${variant.id}/kardex`;

  return (
    <div className="space-y-4">
      <Link href="/stock" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Volver a stock
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kardex · {variant.sku}</h1>
          <p className="text-sm text-muted-foreground">
            {variant.productName} · {variant.color} · talla {variant.size} · código {variant.barcode}
          </p>
        </div>
        <AutoRefresh renderedAt={formatTimeWithSeconds(new Date())} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {locations.map((l) => {
          const s = stock.find((x) => x.locationId === l.id) ?? { onHand: 0, reserved: 0, available: 0 };
          return (
            <Card key={l.id} size="sm">
              <CardContent>
                <div className="text-xs text-muted-foreground">{l.name}</div>
                <div className="text-2xl font-semibold tabular-nums">{s.available}</div>
                <div className="text-xs text-muted-foreground">
                  disponible · físico {s.onHand} · reservado {s.reserved}
                </div>
              </CardContent>
            </Card>
          );
        })}
        <Card size="sm">
          <CardContent>
            <div className="text-xs text-muted-foreground">En tránsito</div>
            <div className="text-2xl font-semibold tabular-nums">{inTransit}</div>
            <div className="text-xs text-muted-foreground">enviado y aún no recibido</div>
          </CardContent>
        </Card>
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label="Filtrar por ubicación">
        {[{ id: undefined, name: "Todas" }, ...locations].map((l) => {
          const active = l.id === locationId;
          return (
            <Link
              key={l.id ?? "all"}
              href={l.id ? `${base}?ubicacion=${l.id}` : base}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                active ? "border-brand-pink-strong bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
              )}
            >
              {l.name}
            </Link>
          );
        })}
      </nav>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Ubicación</TableHead>
              <TableHead>Movimiento</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Usuario</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Sin movimientos{locationId ? " en esta ubicación" : ""}.
                </TableCell>
              </TableRow>
            )}
            {movements.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(m.createdAt)}</TableCell>
                <TableCell>{m.locationName}</TableCell>
                <TableCell>
                  <Badge variant={m.quantity < 0 ? "outline" : "secondary"}>{MOVEMENT_LABEL[m.type]}</Badge>
                </TableCell>
                <TableCell
                  className={cn("text-right font-medium tabular-nums", m.quantity > 0 ? "text-emerald-700" : "text-red-700")}
                >
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{m.onHandAfter}</TableCell>
                <TableCell className="max-w-64">
                  <div className="truncate" title={m.reason ?? undefined}>
                    {m.refType === "TRANSFER" && m.refId ? (
                      <Link href={`/traslados/${m.refId}`} className="text-brand-ink underline-offset-4 hover:underline" data-testid="kardex-transfer-link">
                        {m.reason ?? REF_LABEL[m.refType]}
                      </Link>
                    ) : (
                      (m.reason ?? REF_LABEL[m.refType])
                    )}
                  </div>
                  {m.refId && m.refType !== "TRANSFER" && (
                    <div className="font-mono text-[11px] text-muted-foreground" title={m.refId}>
                      {REF_LABEL[m.refType]} {m.refId.slice(-8)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">{m.userName}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Los movimientos no se editan ni se borran: una corrección se registra como un movimiento nuevo. Saldo = físico en esa
        ubicación después del movimiento.
      </p>
    </div>
  );
}
