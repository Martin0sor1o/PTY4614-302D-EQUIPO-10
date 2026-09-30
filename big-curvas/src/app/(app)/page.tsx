import Link from "next/link";
import { requirePageAccess } from "@/modules/auth";
import { navItemsFor } from "@/components/layout/nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const user = await requirePageAccess(["ADMIN", "VENDEDORA", "BODEGA"]);
  const items = navItemsFor(user.role).filter((i) => i.href !== "/");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {user.name}</h1>
        <p className="text-muted-foreground">
          {user.role === "ADMIN"
            ? "Tienes acceso a todas las ubicaciones. Elige dónde operar arriba a la derecha."
            : `Estás operando en ${user.location?.name}.`}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Pantallas disponibles para tu rol</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-xl transition-shadow hover:shadow-md">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {item.label} <Badge variant="secondary">Etapa {item.stage}</Badge>
                  </CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
