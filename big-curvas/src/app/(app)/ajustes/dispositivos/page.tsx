import type { Metadata } from "next";
import { listLocations } from "@/modules/locations";
import { listDevices, requirePageAccess, type DeviceStatus } from "@/modules/auth";
import { PairDevicePanel, RevokeDeviceButton } from "@/components/auth/devices-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dispositivos de caja" };

const STATUS: Record<DeviceStatus, { label: string; tone: StatusTone }> = {
  VINCULADO: { label: "Vinculado", tone: "ok" },
  PENDIENTE: { label: "Esperando el código", tone: "warn" },
  CODIGO_VENCIDO: { label: "Código vencido", tone: "neutral" },
  REVOCADO: { label: "Revocado", tone: "danger" },
};

// RF-USR-02: el equipo de la caja queda ligado a UNA tienda. Solo una administradora vincula y revoca.
export default async function DevicesPage() {
  const user = await requirePageAccess(["ADMIN"]);
  const [devices, locations] = await Promise.all([listDevices(user), listLocations()]);
  const stores = locations.filter((l) => l.type === "STORE" && l.sellsPos).map((l) => ({ id: l.id, name: l.name }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Dispositivos de caja</h1>
        <p className="text-sm text-muted-foreground">
          Cada vendedora entra a la caja con su PIN, pero solo desde un equipo vinculado a su tienda. Si pierdes un equipo, revócalo: sus sesiones se cierran al instante.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Vincular un equipo nuevo</CardTitle>
          <CardDescription>Genera un código y escríbelo en el equipo de la caja. El código sirve una sola vez y dura 10 minutos.</CardDescription>
        </CardHeader>
        <CardContent>
          <PairDevicePanel stores={stores} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Equipos</CardTitle>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay equipos vinculados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipo</TableHead>
                  <TableHead>Tienda</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((d) => (
                  <TableRow key={d.id} data-testid="device-row">
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>{d.locationName}</TableCell>
                    <TableCell>
                      <StatusBadge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</StatusBadge>
                    </TableCell>
                    <TableCell>{d.lastSeenAt ? formatDateTime(d.lastSeenAt) : "—"}</TableCell>
                    <TableCell className="text-right">{d.status !== "REVOCADO" ? <RevokeDeviceButton deviceId={d.id} deviceName={d.name} /> : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
