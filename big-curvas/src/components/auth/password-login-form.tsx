"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { passwordLoginAction } from "@/app/login/actions";
import { PendingButton } from "@/components/ui/pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Email + contraseña de la administradora. El error es siempre genérico: no dice si el email existe. */
export function PasswordLoginForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const passwordRef = useRef<HTMLInputElement>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      const result = await passwordLoginAction({ email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
      // Si el ingreso sirve, la acción redirige y nunca llega aquí; si no, se muestra el error y se limpia la contraseña.
      if (!result.ok) {
        setMessage(result.message);
        if (passwordRef.current) passwordRef.current.value = "";
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required maxLength={254} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} ref={passwordRef} />
      </div>
      {message && (
        <p role="alert" className="text-sm font-medium text-tone-danger">
          {message}
        </p>
      )}
      <PendingButton type="submit" size="lg" className="h-11 w-full" pending={pending} pendingLabel="Entrando…">
        Entrar
      </PendingButton>
    </form>
  );
}
