import type { ComponentProps, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Botón de una acción que tarda. Con `pending`: spinner, texto en curso ("Cobrando…"), deshabilitado y `aria-busy`.
 * Se ve menos apagado que un botón deshabilitado a secas, para que el texto en curso se lea. Solo presenta el estado:
 * no ejecuta nada ni genera claves. Con movimiento reducido el spinner queda quieto (regla global).
 */
export function PendingButton({
  pending,
  pendingLabel,
  disabled,
  className,
  children,
  ...props
}: ComponentProps<typeof Button> & { pending: boolean; pendingLabel: ReactNode }) {
  return (
    <Button {...props} className={cn("aria-busy:disabled:opacity-80", className)} disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
