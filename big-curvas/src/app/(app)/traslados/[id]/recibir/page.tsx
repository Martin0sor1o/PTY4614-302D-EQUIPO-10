import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccess } from "@/lib/access";
import { requirePageAccess } from "@/modules/auth";
import { ReceiveForm } from "@/components/transfers/receive-form";
import { loadTransfer } from "../../load-transfer";

export const dynamic = "force-dynamic";

export default async function ReceiveTransferPage({ params }: PageProps<"/traslados/[id]/recibir">) {
  const user = await requirePageAccess(["ADMIN", "VENDEDORA", "BODEGA"]);
  const t = await loadTransfer(params);
  if (!canAccess(user, { roles: ["ADMIN", "VENDEDORA", "BODEGA"], locationId: t.toLocation.id })) redirect("/sin-acceso");
  if (t.status !== "EN_TRANSITO") redirect(`/traslados/${t.id}`);

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/traslados/${t.id}`} className="text-sm text-brand-ink underline-offset-4 hover:underline">
          ← {t.number}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Recibir {t.number}</h1>
        <p className="text-sm text-muted-foreground">
          De <strong>{t.fromLocation.name}</strong> a <strong>{t.toLocation.name}</strong>. Escanea cada prenda que llega: el stock de{" "}
          {t.toLocation.name} sube solo con lo escaneado.
        </p>
      </div>
      <ReceiveForm
        transferId={t.id}
        number={t.number}
        lines={t.lines.map((l) => ({
          variantId: l.variantId,
          sku: l.sku,
          barcode: l.barcode,
          description: `${l.productName} · ${l.color} · T${l.size}`,
          qtySent: l.qtySent,
        }))}
      />
    </div>
  );
}
