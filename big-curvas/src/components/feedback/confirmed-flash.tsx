"use client";

import { useEffect } from "react";
import { flashStore, type FlashKind } from "@/lib/flash";

/**
 * En la pantalla de destino: entrega el aviso si alguien acaba de recibir la confirmación del servidor. Al abrir ese
 * mismo comprobante desde otra parte no muestra nada. `message` null: los datos aún no muestran la acción hecha.
 */
export function ConfirmedFlash({ kind, id, message }: { kind: FlashKind; id: string; message: string | null }) {
  useEffect(() => {
    if (message) flashStore.deliver(kind, id, message);
  }, [kind, id, message]);
  return null;
}
