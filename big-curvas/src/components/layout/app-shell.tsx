import type { ReactNode } from "react";
import { Check, LogOut, MapPin } from "lucide-react";
import type { SessionUser } from "@/lib/access";
import { isDemoMode } from "@/lib/demo";
import { countPendingTransfers } from "@/modules/inventory";
import { countPendingApprovals } from "@/modules/approvals";
import { countOrdersToPrepare } from "@/modules/orders";
import { listLocations } from "@/modules/locations";
import { logoutAction, setActiveLocationAction } from "@/app/(app)/session-actions";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { DesktopRail, MobileBar } from "./app-nav";
import { navItemsFor } from "./nav";

const ROLE_LABEL = { ADMIN: "Administradora", VENDEDORA: "Vendedora", BODEGA: "Bodega" } as const;

/**
 * Marco de todas las pantallas autenticadas: riel lateral negro en escritorio (md+, se contrae a mano), barra negra con cajón en
 * celular y, arriba del contenido, la barra de contexto (ubicación siempre visible, «Operando en» y sesión).
 */
export async function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const isAdmin = user.role === "ADMIN";
  // Contador de "Traslados": por enviar + por recibir de la ubicación activa (+ diferencias por resolver si es Belén).
  const pendingTransfers = (await countPendingTransfers({ locationId: user.activeLocation?.id, includeDifferences: isAdmin })).total;
  // Contador de "Pedidos": pedidos pagados que Belén debe preparar en la bodega.
  const ordersToPrepare = isAdmin ? await countOrdersToPrepare() : 0;
  // Contador de "Aprobaciones": solicitudes de las vendedoras que Belén aún no decide.
  const pendingApprovals = isAdmin ? await countPendingApprovals() : 0;
  const badgeOf = (href: string) =>
    href === "/traslados" ? pendingTransfers : href === "/pedidos" ? ordersToPrepare : href === "/aprobaciones" ? pendingApprovals : undefined;
  const items = navItemsFor(user.role).map(({ href, label }) => ({ href, label, badge: badgeOf(href) }));
  const locations = isAdmin ? await listLocations() : [];

  const brand = <Wordmark size="sm" tone="onDark" />;

  return (
    <div className="flex min-h-full flex-1">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground print:hidden"
      >
        Saltar al contenido
      </a>

      <DesktopRail items={items} brand={brand} demo={isDemoMode()} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar items={items} brand={brand}>
          <div className="leading-tight">
            <div className="font-semibold">{user.name}</div>
            <div className="text-brand-pink/80">{ROLE_LABEL[user.role]}</div>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="onDark" size="lg" className="w-full">
              <LogOut aria-hidden /> Salir
            </Button>
          </form>
        </MobileBar>

        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b bg-card/60 px-4 py-2.5 md:px-6 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            {/* Indicador de ubicación: siempre visible */}
            <div
              data-testid="location-indicator"
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm font-semibold"
            >
              <MapPin className="size-4" aria-hidden />
              <span>
                Ubicación: {isAdmin ? "Todas" : user.location?.name}
                {isAdmin && user.activeLocation && <span className="font-normal text-muted-foreground"> · operando en {user.activeLocation.name}</span>}
              </span>
            </div>

            {isAdmin && (
              <form action={setActiveLocationAction} className="flex flex-wrap items-center gap-1.5 text-sm">
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
                        "inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-xs font-semibold md:min-h-8",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-secondary",
                      )}
                    >
                      {active && <Check className="size-3.5" aria-hidden />}
                      {loc.name.replace("Tienda ", "")}
                    </button>
                  );
                })}
                {!user.activeLocation && <StatusBadge tone="warn">Elige una ubicación para operar</StatusBadge>}
              </form>
            )}
          </div>

          <div className="hidden items-center gap-3 text-sm md:flex">
            <div className="text-right leading-tight">
              <div className="font-semibold">{user.name}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</div>
            </div>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                <LogOut aria-hidden /> Salir
              </Button>
            </form>
          </div>
        </header>

        <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
