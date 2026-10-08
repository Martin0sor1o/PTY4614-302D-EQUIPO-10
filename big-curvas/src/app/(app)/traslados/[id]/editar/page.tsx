import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccess } from "@/lib/access";
import { requirePageAccess } from "@/modules/auth";
import { TransferEditor } from "@/components/transfers/transfer-editor";
import { loadTransfer } from "../../load-transfer";

export const dynamic = "force-dynamic";

export default async function EditTransferPage({ params }: PageProps<"/traslados/[id]/editar">) {
  const user = await requirePageAccess(["ADMIN", "VENDEDORA", "BODEGA"]);
  const t = await loadTransfer(params);
  if (!canAccess(user, { roles: ["ADMIN", "VENDEDORA", "BODEGA"], locationId: t.fromLocation.id })) redirect("/sin-acceso");
  if (t.status !== "BORRADOR" || t.lines.some((l) => l.linked)) redirect(`/traslados/${t.id}`);

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/traslados/${t.id}`} className="text-sm text-brand-ink underline-offset-4 hover:underline">
          ← {t.number}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Editar borrador {t.number}</h1>
        <p className="text-sm text-muted-foreground">
          De <strong>{t.fromLocation.name}</strong> a <strong>{t.toLocation.name}</strong>. El stock no se mueve hasta enviarlo.
        </p>
      </div>
      <TransferEditor
        transferId={t.id}
        fromName={t.fromLocation.name}
        toName={t.toLocation.name}
        initialLines={t.lines.map((l) => ({
          variantId: l.variantId,
          sku: l.sku,
          description: `${l.productName} · ${l.color} · T${l.size}`,
          qty: l.qtySent,
          available: null,
        }))}
      />
    </div>
  );
}
