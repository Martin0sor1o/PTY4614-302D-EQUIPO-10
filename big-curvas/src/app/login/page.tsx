import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/demo";
import { demoAccessEnabled, getCurrentUser, getDeviceLogin, listDemoLoginOptions } from "@/modules/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { PinLoginForm } from "@/components/auth/pin-login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { demoLoginAction } from "./actions";

const ROLE_LABEL = { ADMIN: "Administradora", VENDEDORA: "Vendedora", BODEGA: "Bodega" } as const;

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  // Con DEMO_MODE=true pero cuentas reales en la base, el acceso demo queda deshabilitado y se muestra el login real.
  return isDemoMode() && (await demoAccessEnabled()) ? <DemoLogin justReset={params.reiniciado === "1"} /> : <RealLogin justLinked={params.vinculado === "1"} />;
}

/** DEMO: pantalla "Entrar como…" sin contraseña. Solo existe con DEMO_MODE=true. */
async function DemoLogin({ justReset }: { justReset: boolean }) {
  const options = await listDemoLoginOptions();
  return (
    <AuthShell>
      <Notice tone="warn" title="Demo con datos ficticios" role="note" data-testid="demo-notice">
        Esta versión de prueba entra sin contraseña y no guarda información real. No ingreses datos personales.
      </Notice>
      {justReset && (
        <Notice tone="ok" role="status">
          Los datos de demo volvieron al inicio. Elige un usuario para entrar.
        </Notice>
      )}
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
    </AuthShell>
  );
}

/** Acceso real: email + contraseña (administradora) y, en un equipo de caja vinculado, el PIN de cada vendedora. */
async function RealLogin({ justLinked }: { justLinked: boolean }) {
  // Con sesión real iniciada no se muestra el login.
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/cuenta/contrasena" : "/");

  const device = await getDeviceLogin();
  return (
    <AuthShell>
      {justLinked && device && (
        <Notice tone="ok" role="status">
          Equipo vinculado a {device.locationName}. Ya puedes entrar con tu PIN.
        </Notice>
      )}

      {device && (
        <Card data-testid="pos-login">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Caja · {device.locationName}</CardTitle>
            <CardDescription>Equipo «{device.deviceName}». Elige tu nombre y escribe tu PIN.</CardDescription>
          </CardHeader>
          <CardContent>
            <PinLoginForm operators={device.operators} />
          </CardContent>
        </Card>
      )}

      <Card data-testid="web-login">
        <CardHeader>
          <CardTitle className="text-lg font-bold">{device ? "Administradora" : "Entrar"}</CardTitle>
          <CardDescription>Ingresa con tu email y tu contraseña.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordLoginForm />
        </CardContent>
      </Card>

      {!device && (
        <p className="text-center text-sm text-muted-foreground">
          ¿Es el equipo de la caja? Pide a la administradora un código de vinculación y escríbelo en{" "}
          <a href="/vincular" className="font-medium text-brand-ink underline underline-offset-4">
            /vincular
          </a>
          .
        </p>
      )}
    </AuthShell>
  );
}
