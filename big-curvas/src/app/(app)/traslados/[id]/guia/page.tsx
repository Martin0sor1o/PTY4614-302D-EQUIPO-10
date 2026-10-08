import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDateTime } from "@/lib/dates";
import { requirePageAccess } from "@/modules/auth";
import { PrintButton } from "@/components/pos/print-button";
import { TransferStatusBadge } from "@/components/transfers/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadTransfer } from "../../load-transfer";

export const dynamic = "force-dynamic";

/** Guía de traslado imprimible (A4): la lleva Belén en el vehículo. El CSS de impresión está en globals.css (`.guia`). */
export default async function TransferGuidePage({ params }: PageProps<"/traslados/[id]/guia">) {
  await requirePageAccess(["ADMIN", "VENDEDORA", "BODEGA"]);
  const t = await loadTransfer(params);
  if (t.status === "ANULADO") redirect(`/traslados/${t.id}`);
  const units = t.lines.reduce((a, l) => a + l.qtySent, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link href={`/traslados/${t.id}`} className="text-sm text-brand-ink underline-offset-4 hover:underline">
            ← {t.number}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Guía de traslado</h1>
          <p className="text-sm text-muted-foreground">
            {t.status === "BORRADOR" ? "Vista previa: el traslado todavía no se envía." : "Imprímela y súbela al vehículo junto con la mercadería."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <Link href="/traslados" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-4")}>
            Traslados
          </Link>
        </div>
      </div>

      <article className="guia mx-auto w-full max-w-[210mm] bg-white p-6 text-black shadow-sm ring-1 ring-black/10" aria-label={`Guía ${t.number}`}>
        <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
          <div>
            <div className="text-2xl font-extrabold tracking-[0.12em]">BIG CURVAS</div>
            <div className="text-sm">Guía de traslado de mercadería</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-bold" data-testid="guide-number">
              {t.number}
            </div>
            <div className="text-sm">
              {t.status === "BORRADOR" ? "BORRADOR · sin enviar" : <TransferStatusBadge status={t.status} className="print:border print:border-black print:bg-white print:text-black" />}
            </div>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 py-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-600">Origen</dt>
            <dd className="text-base font-semibold">{t.fromLocation.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-600">Destino</dt>
            <dd className="text-base font-semibold">{t.toLocation.name}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-600">Fecha de envío</dt>
            <dd>{t.sentAt ? formatDateTime(t.sentAt) : `Pendiente (creado ${formatDateTime(t.createdAt)})`}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-600">Preparó</dt>
            <dd>{t.sentByName ?? t.createdByName}</dd>
          </div>
        </dl>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y-2 border-black text-left">
              <th className="py-1.5 pr-2">SKU</th>
              <th className="py-1.5 pr-2">Prenda</th>
              <th className="py-1.5 pr-2">Talla</th>
              <th className="py-1.5 pr-2">Color</th>
              <th className="py-1.5 text-right">Cant.</th>
              <th className="w-16 py-1.5 text-center">Recib.</th>
            </tr>
          </thead>
          <tbody>
            {t.lines.map((l) => (
              <tr key={l.id} className="border-b border-neutral-400" data-testid="guide-line">
                <td className="py-1.5 pr-2 font-mono text-xs">{l.sku}</td>
                <td className="py-1.5 pr-2">{l.productName}</td>
                <td className="py-1.5 pr-2">{l.size}</td>
                <td className="py-1.5 pr-2">{l.color}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{l.qtySent}</td>
                <td className="py-1.5">
                  <span className="mx-auto block h-5 w-12 border border-neutral-500" aria-hidden />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black font-semibold">
              <td colSpan={4} className="py-1.5">
                Total ({t.lines.length} {t.lines.length === 1 ? "prenda" : "prendas"})
              </td>
              <td className="py-1.5 text-right tabular-nums" data-testid="guide-units">
                {units}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>

        <div className="mt-12 grid grid-cols-2 gap-10 text-sm">
          <div className="border-t border-black pt-1 text-center">Entrega ({t.fromLocation.name})</div>
          <div className="border-t border-black pt-1 text-center">Recibe ({t.toLocation.name})</div>
        </div>
      </article>
    </div>
  );
}
