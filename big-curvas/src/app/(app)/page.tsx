import type { Metadata } from "next";
import Link from "next/link";
import { isDemoMode } from "@/lib/demo";
import { requirePageAccess } from "@/modules/auth";
import { Ornament } from "@/components/brand/ornament";
import { DemoScript } from "@/components/demo/demo-script";
import { navItemsFor } from "@/components/layout/nav";
import { NAV_ICONS } from "@/components/layout/nav-icons";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Inicio" };

export default async function HomePage() {
  const user = await requirePageAccess(["ADMIN", "VENDEDORA", "BODEGA"]);
  const items = navItemsFor(user.role).filter((i) => i.href !== "/");

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Hola, {user.name}</h1>
          <p className="max-w-xl text-muted-foreground">
            {user.role === "ADMIN"
              ? "Tienes acceso a todas las ubicaciones. Elige dónde operar en la barra de arriba."
              : `Estás operando en ${user.location?.name}.`}
          </p>
        </div>
        <Ornament className="hidden h-12 shrink-0 text-primary/40 sm:block" />
      </div>

      {isDemoMode() && <DemoScript user={user} />}

      <section className="space-y-3" aria-labelledby="pantallas-titulo">
        <h2 id="pantallas-titulo" className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Pantallas disponibles para tu rol
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = NAV_ICONS[item.href];
            return (
              <Link key={item.href} href={item.href} className="group rounded-xl transition-transform hover:-translate-y-0.5 motion-reduce:transition-none">
                <Card className="h-full group-hover:ring-primary/40">
                  <CardHeader className="grid-cols-[auto_1fr] items-center gap-x-3">
                    {Icon && (
                      <span aria-hidden className="row-span-2 grid size-10 place-items-center rounded-full bg-brand-black text-brand-pink">
                        <Icon className="size-5" />
                      </span>
                    )}
                    <CardTitle className="text-base font-bold">{item.label}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
