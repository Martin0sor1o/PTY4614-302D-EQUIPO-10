import { X } from "lucide-react";
import { approvedTitle } from "@/components/approvals/decision";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export interface VoidResult {
  number: string;
  /** Quién aprobó, si la anulación usó una aprobación. */
  approvedBy: string | null;
  withApproval: boolean;
}

/**
 * Resultado de anular una venta, sobre la tabla (solo después de que el servidor lo confirmó). La región existe siempre,
 * para que el lector de pantalla lo anuncie.
 */
export function VoidDone({ result, onClose }: { result: VoidResult | null; onClose: () => void }) {
  return (
    <div role="status" aria-live="polite">
      {result && (
        <Notice tone="ok" title={result.withApproval ? <span className="text-base">{approvedTitle({ decidedByName: result.approvedBy })}</span> : undefined} data-testid="void-done">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>La venta {result.number} quedó anulada y el stock se repuso.</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar aviso de anulación" onClick={onClose}>
              <X />
            </Button>
          </div>
        </Notice>
      )}
    </div>
  );
}
