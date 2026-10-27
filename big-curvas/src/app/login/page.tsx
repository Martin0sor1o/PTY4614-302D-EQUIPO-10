import type { Metadata } from "next";
import { isDemoMode } from "@/lib/demo";
import { listDemoLoginOptions } from "@/modules/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Ornament } from "@/components/brand/ornament";
import { Wordmark } from "@/components/brand/wordmark";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { demoLoginAction } from "./actions";

const ROLE_LABEL = { ADMIN: "Administradora", VENDEDORA: "Vendedora", BODEGA: "Bodega" } as const;

export const dynamic = "force-dynamic";

// DEMO: pantalla "Entrar como…" sin contraseña.
export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const demo = isDemoMode();
  const justReset = (await searchParams).reiniciado === "1";
  const options = await listDemoLoginOptions();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-4 py-10">
      <div className="relative overflow-hidden rounded-3xl bg-brand-black px-6 py-9 text-center text-brand-pink shadow-soft">
        <Ornament className="mx-auto mb-4 h-8 text-brand-pink/60" />
        <h1 className="flex justify-center">
          <Wordmark size="lg" tone="onDark" />
        </h1>
        <p className="mt-4 text-sm">Inventario, POS y pedidos online</p>
      </div>

      {demo && (
        <Notice tone="warn" title="Demo con datos ficticios" role="note" data-testid="demo-notice">
          Esta versión de prueba entra sin contraseña y no guarda información real. No ingreses datos personales.
        </Notice>
      )}
      {demo && justReset && (
        <Notice tone="ok" role="status">
          Los datos de demo volvieron al inicio. Elige un usuario para entrar.
        </Notice>
      )}

      {demo ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              Entrar como… <Badge variant="secondary">DEMO</Badge>
            </CardTitle>
            <CardDescription>Modo demostración: elige un usuario, no se pide contraseña.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {options.map((u) => (
              <form key={u.id} action={demoLoginAction}>
                <input type="hidden" name="userId" value={u.id} />
                <button
                  type="submit"
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-secondary"
                >
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-black text-base font-bold text-brand-pink">
                    {u.name.charAt(0)}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{u.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {ROLE_LABEL[u.role]} · {u.locationName ?? "Todas las ubicaciones"}
                    </span>
                  </span>
                </button>
              </form>
            ))}
            {options.length === 0 && (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                No hay usuarios. Ejecuta <code>pnpm db:seed</code>.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Autenticación no disponible</CardTitle>
            <CardDescription>El inicio de sesión real aún no está implementado (fuera del alcance de la demo).</CardDescription>
          </CardHeader>
        </Card>
      )}
    </main>
  );
}
