import type { Metadata } from "next";
import { LinkDeviceForm } from "@/components/auth/link-device-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vincular equipo" };

// Se abre en el equipo de la caja. El código lo genera una administradora en Ajustes → Dispositivos (un solo uso, 10 min).
export default function LinkDevicePage() {
  return (
    <AuthShell size="md">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">Vincular este equipo a una tienda</CardTitle>
          <CardDescription>Escribe el código que te dio la administradora. Después, cada vendedora entra con su PIN.</CardDescription>
        </CardHeader>
        <CardContent>
          <LinkDeviceForm />
        </CardContent>
      </Card>
    </AuthShell>
  );
}
