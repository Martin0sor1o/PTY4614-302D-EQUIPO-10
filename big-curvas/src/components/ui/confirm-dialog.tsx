"use client";

import { useRef, type RefObject } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Texto de la confirmación (el mismo que antes mostraba `window.confirm`). */
  description: string;
  confirmLabel: string;
  /** Mientras la acción confirmada corre: el botón queda deshabilitado y el diálogo no se cierra. */
  pending: boolean;
  onConfirm: () => void;
  tone?: "default" | "danger";
  /** Dónde queda el foco al cerrar. Sin valor, vuelve al botón que abrió el diálogo. */
  finalFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Confirmación modal (role="alertdialog") que reemplaza a `window.confirm`. El foco inicial está en «Cancelar»:
 * un Enter suelto (p. ej. el que manda el lector de códigos tras cada código) cancela, nunca confirma; confirmar exige
 * llegar al botón con Tab o con el puntero. Escape cancela. Cada sitio decide cuándo cerrarlo; este componente no
 * genera claves de idempotencia ni ejecuta nada por su cuenta.
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, pending, onConfirm, tone = "default", finalFocusRef }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return; // no se cierra a mitad de la acción
        onOpenChange(next);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-brand-black/50" />
        <AlertDialog.Popup
          aria-modal="true"
          initialFocus={cancelRef}
          finalFocus={finalFocusRef}
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-3xl border bg-card p-5 text-card-foreground shadow-soft outline-none"
        >
          <div className="space-y-2">
            <AlertDialog.Title className="font-heading text-lg leading-snug font-bold">{title}</AlertDialog.Title>
            <AlertDialog.Description className="text-base text-muted-foreground">{description}</AlertDialog.Description>
          </div>
          {pending && (
            <p role="status" className="text-sm font-medium text-muted-foreground">
              Procesando, no cierres esta ventana.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialog.Close
              ref={cancelRef}
              disabled={pending}
              render={<Button type="button" variant="outline" size="lg" className="h-11 px-4" />}
            >
              Cancelar
            </AlertDialog.Close>
            <Button type="button" variant={tone === "danger" ? "danger" : "default"} size="lg" className="h-11 px-4" onClick={onConfirm} disabled={pending}>
              {pending ? "Procesando…" : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
