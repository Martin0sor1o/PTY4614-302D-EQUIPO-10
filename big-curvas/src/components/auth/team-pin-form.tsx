"use client";

import { useState, useTransition, type FormEvent } from "react";
import { setSalesPinAction } from "@/app/(app)/ajustes/actions";
import { PendingButton } from "@/components/ui/pending-button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

/** Define o restablece el PIN (6 dígitos) de UNA vendedora. */
export function TeamPinForm({ userId, userName, hasPin }: { userId: string; userName: string; hasPin: boolean }) {
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await setSalesPinAction({ userId, pin });
      setPin("");
      setResult(res.ok ? { ok: true, text: "PIN guardado." } : { ok: false, text: res.message });
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <Input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        placeholder="6 dígitos"
        aria-label={`PIN nuevo de ${userName}`}
        className="h-11 w-32 text-center tracking-[0.4em] md:h-9"
      />
      <PendingButton type="submit" variant="outline" size="sm" disabled={pin.length < 6} pending={pending} pendingLabel="Guardando…">
        {hasPin ? "Restablecer PIN" : "Definir PIN"}
      </PendingButton>
      {result &&
        (result.ok ? (
          <Notice tone="ok" role="status" className="py-1.5">
            {result.text}
          </Notice>
        ) : (
          <span role="alert" className="text-sm font-medium text-tone-danger">
            {result.text}
          </span>
        ))}
    </form>
  );
}
