import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import type { SessionUser } from "@/lib/access";
import { isDemoMode } from "@/lib/demo";
import { listLocations } from "@/modules/locations";
import { logoutAction, setActiveLocationAction } from "@/app/(app)/session-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navItemsFor } from "./nav";
import { NavLinks } from "./nav-links";

const ROLE_LABEL = { ADMIN: "Administradora", VENDEDORA: "Vendedora", BODEGA: "Bodega" } as const;

export async function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const items = navItemsFor(user.role).map(({ href, label }) => ({ href, label }));
  const isAdmin = user.role === "ADMIN";
  const locations = isAdmin ? await listLocations() : [];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight">Big Curvas</span>
            {isDemoMode() && <Badge variant="secondary">DEMO</Badge>}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {/* Indicador de ubicación: siempre visible */}
            <div
              data-testid="location-indicator"
              className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 font-medium"
            >
              <MapPin className="size-4" aria-hidden />
              <span>
                Ubicación: {isAdmin ? "Todas" : user.location?.name}
                {isAdmin && user.activeLocation && (
                  <span className="font-normal text-muted-foreground"> · operando en {user.activeLocation.name}</span>
                )}
              </span>
            </div>
            <div className="text-right leading-tight">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</div>
            </div>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                Salir
              </Button>
            </form>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pb-2">
          <NavLinks items={items} />

          {isAdmin && (
            <form action={setActiveLocationAction} className="flex items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Operando en:</span>
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
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    {loc.name.replace("Tienda ", "")}
                  </button>
                );
              })}
              {!user.activeLocation && <span className="text-xs text-amber-700">Elige una ubicación para operar</span>}
            </form>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
