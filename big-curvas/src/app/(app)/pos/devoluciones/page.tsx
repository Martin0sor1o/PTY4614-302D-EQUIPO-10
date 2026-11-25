import type { Metadata } from "next";
import { requirePageAccess } from "@/modules/auth";
import { demoPinHint } from "@/modules/demo";
import { ReturnFlow } from "@/components/pos/return-flow";
import { PosNotice } from "../context";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cambio / Devolución" };

/**
 * Cambio / Devolución (RF-DEV-01 a 07). VENDEDORA: su tienda. ADMIN: la ubicación elegida en "Operando en": en la bodega Belén
 * registra las devoluciones de pedidos online que llegan por courier (sin cambios ni efectivo: la bodega no vende ni tiene caja).
 */
export default async function ReturnsPage() {
  const user = await requirePageAccess(["ADMIN", "VENDEDORA"]);
  const location = user.activeLocation;
  if (!location) {
    return <PosNotice title="Elige una ubicación">Usa “Operando en” (arriba a la derecha) para elegir dónde se recibe la prenda.</PosNotice>;
  }
  const isStore = location.type === "STORE";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Cambio / Devolución · {location.name}</h1>
        <p className="text-sm text-muted-foreground">La prenda devuelta entra al stock de {location.name}.</p>
      </div>
      <ReturnFlow locationName={location.name} isStore={isStore} demoPinHint={demoPinHint()} />
    </div>
  );
}
