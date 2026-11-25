import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, MonitorSmartphone, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePageAccess } from "@/modules/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ajustes" };

const LINKS = [
  { href: "/ajustes/dispositivos", title: "Dispositivos de caja", description: "Vincula el equipo de la caja a una tienda o revoca uno perdido.", icon: MonitorSmartphone },
  { href: "/ajustes/equipo", title: "Equipo", description: "Define o restablece el PIN de cada vendedora.", icon: Users },
  { href: "/cuenta/contrasena", title: "Mi contraseña y mi PIN", description: "Cambia tu contraseña y define tu PIN de aprobación.", icon: KeyRound },
] as const;

export default async function SettingsPage() {
  await requirePageAccess(["ADMIN"]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Ajustes</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {LINKS.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2">
            <Card className="h-full transition-colors hover:bg-secondary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <Icon className="size-5" aria-hidden /> {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
