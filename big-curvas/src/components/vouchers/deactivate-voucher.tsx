"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { deactivateVoucherAction } from "@/app/(app)/vales/actions";
import { Button } from "@/components/ui/button";
import { PendingButton } from "@/components/ui/pending-button";
import { Input } from "@/components/ui/input";

/** Desactivar un vale (no se borra: queda su saldo y su historial). Pide el motivo y queda en la auditoría. */
export function DeactivateVoucher({ voucherId, code }: { voucherId: string; code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await deactivateVoucherAction({ voucherId, reason });
      if (!res.ok) return setMessage(res.message);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)} data-testid="deactivate-open">
        Desactivar vale
      </Button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-2xl border p-3">
      <p className="text-sm">
        Un vale desactivado no se puede canjear. Se conserva su historial. Vale <span className="font-mono">{code}</span>.
      </p>
      <Input aria-label="Motivo" placeholder="Motivo (ej. la clienta lo perdió)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      {message && (
        <p role="alert" className="text-sm font-medium text-tone-danger">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <PendingButton type="submit" variant="destructive" disabled={reason.trim().length < 3} data-testid="deactivate-confirm" pending={pending} pendingLabel="Desactivando…">
          Desactivar
        </PendingButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
