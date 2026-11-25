import type { Metadata } from "next";
import { listSalesTeam, PIN_LENGTH, requirePageAccess } from "@/modules/auth";
import { TeamPinForm } from "@/components/auth/team-pin-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatTime } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Equipo" };

// RF-USR-02 / RN-29: cada vendedora tiene su PIN (6 dígitos, solo se guarda su hash). Solo una administradora lo define.
export default async function TeamPage() {
  const user = await requirePageAccess(["ADMIN"]);
  const team = await listSalesTeam(user);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Equipo</h1>
        <p className="text-sm text-muted-foreground">
          El PIN de cada vendedora tiene {PIN_LENGTH} dígitos. Al restablecerlo se desbloquea y se cierran sus sesiones de caja. Entrégaselo en persona.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Vendedoras</CardTitle>
          <CardDescription>Solo ven y operan en su tienda.</CardDescription>
        </CardHeader>
        <CardContent>
          {team.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay vendedoras activas.</p>
          ) : (
            <ul className="divide-y">
              {team.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="team-row">
                  <div className="space-y-1">
                    <div className="font-semibold">{m.name}</div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{m.locationName ?? "Sin tienda"}</span>
                      <StatusBadge tone={m.hasPin ? "ok" : "warn"}>{m.hasPin ? "Con PIN" : "Sin PIN"}</StatusBadge>
                      {m.pinLockedUntil && <StatusBadge tone="danger">Bloqueado hasta las {formatTime(m.pinLockedUntil)}</StatusBadge>}
                    </div>
                  </div>
                  <TeamPinForm userId={m.id} userName={m.name} hasPin={m.hasPin} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
