import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/(app)/session-actions";
import { ApprovalPinForm, ChangePasswordForm } from "@/components/auth/change-password-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { hasApprovalPin, PASSWORD_MIN_LENGTH, requireSessionPage } from "@/modules/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mi contraseña" };

// Cambio de contraseña: fuera del grupo (app) a propósito. Con una contraseña temporal es lo ÚNICO que se puede hacer
// (requireAccess rechaza el resto); la página solo exige sesión.
export default async function ChangePasswordPage() {
  const user = await requireSessionPage();
  // La contraseña es de la vía web (administradora, bodega). La vendedora de caja y la demo no tienen.
  if (user.sessionKind !== "WEB") redirect("/");

  const forced = user.mustChangePassword === true;
  const hasPin = user.role === "ADMIN" ? await hasApprovalPin(user.id) : false;

  return (
    <AuthShell size="md">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">{forced ? "Elige tu contraseña" : "Cambiar contraseña"}</CardTitle>
          <CardDescription>
            {forced ? "Entraste con una contraseña temporal. Para seguir, elige una propia." : "Al cambiarla se cierran tus otras sesiones abiertas."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {forced && (
            <Notice tone="warn" role="note">
              Hasta que la cambies no puedes usar el resto del sistema.
            </Notice>
          )}
          <ChangePasswordForm minLength={PASSWORD_MIN_LENGTH} />
        </CardContent>
      </Card>

      {user.role === "ADMIN" && !forced && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">PIN de aprobación</CardTitle>
          </CardHeader>
          <CardContent>
            <ApprovalPinForm hasPin={hasPin} />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        {!forced ? (
          <Link href="/" className="text-sm font-medium text-brand-ink underline-offset-4 hover:underline max-md:min-h-11 max-md:content-center">
            Volver al inicio
          </Link>
        ) : (
          <span />
        )}
        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm">
            <LogOut aria-hidden /> Salir
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
