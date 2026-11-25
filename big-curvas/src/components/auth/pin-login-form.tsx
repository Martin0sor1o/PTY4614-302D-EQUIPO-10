"use client";

import { useState, useTransition, type FormEvent } from "react";
import { pinLoginAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface OperatorChoice {
  id: string;
  name: string;
}

/** Caja compartida: la vendedora elige su nombre y escribe su PIN de 6 dígitos. */
export function PinLoginForm({ operators }: { operators: OperatorChoice[] }) {
  const [userId, setUserId] = useState(operators.length === 1 ? operators[0].id : "");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!userId) return setMessage("Elige tu nombre.");
    setMessage(null);
    startTransition(async () => {
      const result = await pinLoginAction({ userId, pin });
      if (!result.ok) {
        setMessage(result.message);
        setPin("");
      }
    });
  }

  if (operators.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay vendedoras con PIN en esta tienda. Pide a la administradora que lo defina en Ajustes → Equipo.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">¿Quién eres?</legend>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
          {operators.map((o) => (
            <Button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={userId === o.id}
              variant={userId === o.id ? "default" : "outline"}
              className={cn("h-12 justify-start px-4 text-base")}
              onClick={() => setUserId(o.id)}
            >
              {o.name}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="pin">PIN (6 dígitos)</Label>
        <Input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="h-12 text-center text-xl tracking-[0.5em]"
        />
      </div>
      {message && (
        <p role="alert" className="text-sm font-medium text-tone-danger">
          {message}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending || pin.length < 6 || !userId}>
        {pending ? "Entrando…" : "Entrar a la caja"}
      </Button>
    </form>
  );
}
