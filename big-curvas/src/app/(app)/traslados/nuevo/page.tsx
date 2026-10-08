import Link from "next/link";
import { requirePageAccess } from "@/modules/auth";
import { listLocations } from "@/modules/locations";
import { TransferEditor } from "@/components/transfers/transfer-editor";

export const dynamic = "force-dynamic";

export default async function NewTransferPage() {
  const user = await requirePageAccess(["ADMIN", "VENDEDORA", "BODEGA"]);
  const from = user.activeLocation;
  const others = from ? (await listLocations()).filter((l) => l.id !== from.id) : [];

  if (!from || others.length !== 1) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border bg-card p-6 text-center" role="status">
        <h1 className="text-lg font-semibold">{from ? "No se puede crear el traslado" : "Elige una ubicación"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {from
            ? "Esta pantalla traslada entre dos ubicaciones y hoy hay más (o menos) de dos activas."
            : "Usa “Operando en” (arriba a la derecha) para elegir desde dónde envías la mercadería."}
        </p>
        <Link href="/traslados" className="mt-3 inline-block text-sm text-brand-ink underline">
          Volver a Traslados
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo traslado</h1>
        <p className="text-sm text-muted-foreground">
          De <strong>{from.name}</strong> a <strong>{others[0].name}</strong>. Queda en borrador: el stock no se mueve hasta que lo envíes.
        </p>
      </div>
      <TransferEditor fromName={from.name} toName={others[0].name} initialLines={[]} />
    </div>
  );
}
