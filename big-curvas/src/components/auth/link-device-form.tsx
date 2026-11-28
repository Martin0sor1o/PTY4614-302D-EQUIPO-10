"use client";

import { useState, useTransition, type FormEvent } from "react";
import { linkDeviceAction } from "@/app/vincular/actions";
import { PendingButton } from "@/components/ui/pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Se escribe en el equipo de la caja el código que generó la administradora en Ajustes → Dispositivos. */
export function LinkDeviceForm() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await linkDeviceAction({ code });
      if (!result.ok) {
        setMessage(result.message);
        setCode("");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="code">Código de vinculación</Label>
        <Input
          id="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCD-EFGH"
          maxLength={12}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="h-12 text-center font-mono text-xl tracking-widest"
        />
      </div>
      {message && (
        <p role="alert" className="text-sm font-medium text-tone-danger">
          {message}
        </p>
      )}
      <PendingButton type="submit" size="lg" className="h-11 w-full" disabled={code.replace(/[\s-]/g, "").length < 8} pending={pending} pendingLabel="Vinculando…">
        Vincular este equipo
      </PendingButton>
    </form>
  );
}
