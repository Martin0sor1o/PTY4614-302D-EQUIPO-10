import { isDemoMode } from "@/lib/demo";
import { listDemoLoginOptions } from "@/modules/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { demoLoginAction } from "./actions";

const ROLE_LABEL = { ADMIN: "Administradora", VENDEDORA: "Vendedora", BODEGA: "Bodega" } as const;

export const dynamic = "force-dynamic";

// DEMO: pantalla "Entrar como…" sin contraseña.
export default async function LoginPage() {
  const demo = isDemoMode();
  const options = await listDemoLoginOptions();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div className="space-y-1 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Big Curvas</h1>
        <p className="text-muted-foreground">Inventario, POS y pedidos online</p>
      </div>

      {demo ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
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
                  className="w-full rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-muted"
                >
                  <div className="font-medium">{u.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {ROLE_LABEL[u.role]} · {u.locationName ?? "Todas las ubicaciones"}
                  </div>
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
