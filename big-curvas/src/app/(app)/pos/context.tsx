import type { ReactNode } from "react";
import type { SessionLocation, SessionUser } from "@/lib/access";
import { requirePageAccess } from "@/modules/auth";

/**
 * Contexto de las páginas del POS. VENDEDORA: su tienda. ADMIN: la tienda elegida en "Operando en".
 * BODEGA no tiene POS (RN-28): `requirePageAccess` la manda a /sin-acceso. Las acciones lo vuelven a validar.
 */
export async function posPageContext(): Promise<{ user: SessionUser; location: SessionLocation | null; problem: ReactNode | null }> {
  const user = await requirePageAccess(["ADMIN", "VENDEDORA"]);
  const location = user.activeLocation;
  if (!location) {
    return { user, location: null, problem: <PosNotice title="Elige una tienda">Usa “Operando en” (arriba a la derecha) para elegir la tienda en la que vas a vender.</PosNotice> };
  }
  if (location.type !== "STORE") {
    return {
      user,
      location,
      problem: <PosNotice title={`${location.name} no vende en POS`}>La bodega no vende al público. Elige una tienda en “Operando en”.</PosNotice>,
    };
  }
  return { user, location, problem: null };
}

export function PosNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border bg-card p-6 text-center" role="status">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
