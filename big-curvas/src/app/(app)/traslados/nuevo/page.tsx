import type { Metadata } from "next";
import Link from "next/link";
import { requirePageAccess } from "@/modules/auth";
import { listLocations } from "@/modules/locations";
import { TransferEditor } from "@/components/transfers/transfer-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Nuevo traslado" };

export default async function NewTransferPage() {
  const user = await requirePageAccess(["ADMIN", "VENDEDORA", "BODEGA"]);
  const from = user.activeLocation;
  const others = from ? (await listLocations()).filter((l) => l.id !== from.id) : [];

  if (!from || others.length !== 1) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border bg-card p-6 shadow-soft text-center" role="status">
        <h1 className="text-lg font-semibold">{from ? "No se puede crear el traslado" : "Elige una ubicación"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {from
            ? "Esta pantalla traslada entre dos ubicaciones y hoy hay más (o menos) de dos activas."
            : "Usa “Operando en” (arriba a la derecha) para elegir desde dónde envías la mercadería."}
        </p>
        <Link href="/traslados" className="mt-3 inline-flex items-center text-sm text-brand-ink underline underline-offset-4 max-md:min-h-11">
          Volver a Traslados
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nuevo traslado</h1>
        <p className="text-sm text-muted-foreground">
          De <strong>{from.name}</strong> a <strong>{others[0].name}</strong>. Queda en borrador: el stock no se mueve hasta que lo envíes.
        </p>
      </div>
      <TransferEditor fromName={from.name} toName={others[0].name} initialLines={[]} />
    </div>
  );
}
