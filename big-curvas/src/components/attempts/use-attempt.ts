"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createAttemptController, type AttemptOptions } from "@/lib/pending-attempt";

function tabStorage() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // navegador con el almacenamiento bloqueado: el envío queda solo en memoria
  }
}

/**
 * Conecta el envío pendiente (lib/pending-attempt) con una pantalla. Las opciones se fijan al montar: la pantalla debe
 * montarse con `key` por ubicación, porque el `slot` y lo que hace `onDone` dependen de ella.
 */
export function useAttempt<P extends object>(options: Omit<AttemptOptions<P>, "storage">) {
  const [controller] = useState(() => createAttemptController<P>({ ...options, storage: tabStorage() }));
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  useEffect(() => controller.load(), [controller]);
  return { controller, view };
}
