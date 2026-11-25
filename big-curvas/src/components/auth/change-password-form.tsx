"use client";

import { useState, useTransition, type FormEvent } from "react";
import { changePasswordAction, setApprovalPinAction } from "@/app/cuenta/contrasena/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";

/** Cambio de contraseña. Con contraseña temporal es obligatorio antes de usar el sistema. */
export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage(null);
    startTransition(async () => {
      const result = await changePasswordAction({
        current: String(data.get("current") ?? ""),
        next: String(data.get("next") ?? ""),
        confirm: String(data.get("confirm") ?? ""),
      });
      if (!result.ok) {
        setMessage(result.message);
        form.reset();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="current">Contraseña actual</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required maxLength={128} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="next">Contraseña nueva</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" required minLength={minLength} maxLength={128} />
        <p className="text-xs text-muted-foreground">Al menos {minLength} caracteres. Una frase larga es mejor que una palabra con símbolos.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Repite la contraseña nueva</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required maxLength={128} />
      </div>
      {message && (
        <p role="alert" className="text-sm font-medium text-tone-danger">
          {message}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}

/** PIN de aprobación presencial de la administradora (6 dígitos), confirmado con su contraseña. */
export function ApprovalPinForm({ hasPin }: { hasPin: boolean }) {
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage(null);
    startTransition(async () => {
      const result = await setApprovalPinAction({ password: String(data.get("password") ?? ""), pin: String(data.get("pin") ?? "") });
      form.reset();
      setMessage(result.ok ? { tone: "ok", text: "PIN guardado." } : { tone: "danger", text: result.message });
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {hasPin ? "Ya tienes un PIN. Puedes cambiarlo aquí." : "Aún no tienes PIN."} Sirve para aprobar descuentos y anulaciones cuando estás en la tienda.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="pin-password">Tu contraseña</Label>
        <Input id="pin-password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
      </div>
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="approval-pin">PIN nuevo (6 dígitos)</Label>
        <Input
          id="approval-pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          className="h-11 text-center text-lg tracking-[0.5em]"
        />
      </div>
      {message &&
        (message.tone === "ok" ? (
          <Notice tone="ok" role="status">
            {message.text}
          </Notice>
        ) : (
          <p role="alert" className="text-sm font-medium text-tone-danger">
            {message.text}
          </p>
        ))}
      <Button type="submit" variant="outline" size="lg" className="h-11" disabled={pending}>
        {pending ? "Guardando…" : "Guardar PIN"}
      </Button>
    </form>
  );
}
