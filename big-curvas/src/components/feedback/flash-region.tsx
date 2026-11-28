"use client";

import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { flashStore, type FlashMessage } from "@/lib/flash";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export const FLASH_VISIBLE_MS = 8_000;

/**
 * Lo que se dibuja. La región `aria-live` existe SIEMPRE, también vacía: un lector de pantalla solo anuncia lo que
 * cambia dentro de una región que ya estaba en la página. No toma el foco y no se imprime.
 * Posición: arriba en celular (abajo están los botones de Aprobaciones) y abajo al centro en escritorio (no tapa el
 * pago del POS). Sin animación: aparece al tiro.
 */
export function FlashView({
  message,
  onClose,
  onPause,
}: {
  message: FlashMessage | null;
  onClose: (id: number) => void;
  onPause: (id: number | null) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[55] flex justify-center md:top-auto md:bottom-4 print:hidden" data-testid="flash-region">
      <div
        className={message ? "pointer-events-auto relative w-full max-w-md" : "w-full max-w-md"}
        onMouseEnter={() => message && onPause(message.id)}
        onMouseLeave={() => onPause(null)}
        onFocus={() => message && onPause(message.id)}
        onBlur={() => onPause(null)}
      >
        <div role="status" aria-live="polite" aria-atomic="true">
          {message && (
            <Notice key={message.id} tone={message.tone} className="pr-14 text-base font-semibold shadow-soft" data-testid="flash-message">
              {/* Cada tramo entre «·» va junto: la línea se parte entre tramos, no entre «vuelto» y su monto ni dentro del vale enmascarado. */}
              {message.text.split(" · ").map((part, i) => (
                <Fragment key={i}>
                  {i > 0 && " · "}
                  <span className="inline-block">{part}</span>
                </Fragment>
              ))}
            </Notice>
          )}
        </div>
        {message && (
          <Button type="button" variant="ghost" size="icon" className="absolute top-1.5 right-1.5" aria-label="Cerrar aviso" onClick={() => onClose(message.id)}>
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Se monta una vez en el layout de las pantallas autenticadas. Se cierra sola (se pausa con el puntero o el foco encima). */
export function FlashRegion() {
  const message = useSyncExternalStore(flashStore.subscribe, flashStore.getSnapshot, flashStore.getServerSnapshot);
  const [pausedId, setPausedId] = useState<number | null>(null);
  const paused = message !== null && pausedId === message.id;

  useEffect(() => {
    if (!message || paused) return;
    const t = setTimeout(() => flashStore.dismiss(message.id), FLASH_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [message, paused]);

  return <FlashView message={message} onClose={flashStore.dismiss} onPause={setPausedId} />;
}
