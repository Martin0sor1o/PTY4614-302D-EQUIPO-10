import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import type { SessionUser } from "@/lib/access";
import { isDemoMode } from "@/lib/demo";
import { countPendingTransfers } from "@/modules/inventory";
import { listLocations } from "@/modules/locations";
import { logoutAction, setActiveLocationAction } from "@/app/(app)/session-actions";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navItemsFor } from "./nav";
import { NavLinks } from "./nav-links";

const ROLE_LABEL = { ADMIN: "Administradora", VENDEDORA: "Vendedora", BODEGA: "Bodega" } as const;

export async function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const isAdmin = user.role === "ADMIN";
  // Contador de "Traslados": por enviar + por recibir de la ubicación activa (+ diferencias por resolver si es Belén).
  const pendingTransfers = (await countPendingTransfers({ locationId: user.activeLocation?.id, includeDifferences: isAdmin })).total;
  const items = navItemsFor(user.role).map(({ href, label }) => ({ href, label, badge: href === "/traslados" ? pendingTransfers : undefined }));
  const locations = isAdmin ? await listLocations() : [];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-brand-black text-brand-pink print:hidden">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <BrandLogo />
            {isDemoMode() && <Badge>DEMO</Badge>}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {/* Indicador de ubicación: siempre visible */}
            <div
              data-testid="location-indicator"
              className="flex items-center gap-1.5 rounded-md border border-brand-pink/40 bg-white/5 px-2.5 py-1 font-medium"
            >
              <MapPin className="size-4" aria-hidden />
              <span>
                Ubicación: {isAdmin ? "Todas" : user.location?.name}
                {isAdmin && user.activeLocation && (
                  <span className="font-normal text-brand-pink/75"> · operando en {user.activeLocation.name}</span>
                )}
              </span>
            </div>
            <div className="text-right leading-tight">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-brand-pink/75">{ROLE_LABEL[user.role]}</div>
            </div>
            <form action={logoutAction}>
              <Button type="submit" variant="onDark" size="sm">
                Salir
              </Button>
            </form>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pb-3">
          <NavLinks items={items} />

          {isAdmin && (
            <form action={setActiveLocationAction} className="flex items-center gap-1.5 text-sm">
              <span className="text-brand-pink/75">Operando en:</span>
              {locations.map((loc) => {
                const active = user.activeLocation?.id === loc.id;
                return (
                  <button
                    key={loc.id}
                    type="submit"
                    name="locationId"
                    value={loc.id}
                    aria-pressed={active}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-pink-strong",
                      active
                        ? "border-brand-pink bg-brand-pink text-brand-black"
                        : "border-brand-pink/40 text-brand-pink hover:bg-brand-pink hover:text-brand-black",
                    )}
                  >
                    {loc.name.replace("Tienda ", "")}
                  </button>
                );
              })}
              {!user.activeLocation && <span className="text-xs text-amber-300">Elige una ubicación para operar</span>}
            </form>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
