// Avisos de confirmación ("Venta RGA-000197 cobrada · …"). Viven en la memoria de la pestaña: sobreviven a la navegación
// entre pantallas y se pierden al recargar, a propósito.
//
// Dos pasos cuando la acción cambia de pantalla: quien recibe la confirmación del servidor la ANUNCIA (`expect`) y la
// pantalla de destino arma el texto con sus propios datos y la ENTREGA (`deliver`). Así el aviso sale una sola vez, solo
// después de confirmada la acción, y con los montos que guardó el servidor.
//
// Se llama justo después de confirmar un cobro: ninguna función deja escapar un error de quienes escuchan.
//
// Lógica sin React ni DOM (se prueba en Node). La dibuja components/feedback/flash-region.

export type FlashKind = "venta" | "devolucion" | "traslado-enviado" | "traslado-recibido";
export type FlashTone = "ok" | "neutral";

export interface FlashMessage {
  /** Cambia en cada aviso, aunque el texto se repita: así el lector de pantalla lo vuelve a anunciar. */
  id: number;
  tone: FlashTone;
  text: string;
}

/** Cuánto se espera la pantalla de destino. Pasado esto, abrir ese comprobante más tarde ya no muestra el aviso. */
export const EXPECT_TTL_MS = 120_000;

export function createFlashStore(now: () => number = () => Date.now()) {
  let current: FlashMessage | null = null;
  let seq = 0;
  /** "venta:<id>" → hasta cuándo se espera. */
  const expected = new Map<string, number>();
  const listeners = new Set<() => void>();

  function emit() {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // un aviso que no se puede dibujar no afecta la operación que lo originó
      }
    }
  }

  function show(text: string, tone: FlashTone = "ok") {
    current = { id: ++seq, tone, text };
    emit();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => current,
    getServerSnapshot: (): FlashMessage | null => null,
    show,
    dismiss(id: number) {
      if (current?.id !== id) return;
      current = null;
      emit();
    },
    expect(kind: FlashKind, id: string) {
      expected.set(`${kind}:${id}`, now() + EXPECT_TTL_MS);
    },
    /** Muestra el aviso solo si estaba anunciado, y lo consume: una segunda entrega no hace nada. */
    deliver(kind: FlashKind, id: string, text: string): boolean {
      const key = `${kind}:${id}`;
      const deadline = expected.get(key);
      if (deadline === undefined) return false;
      expected.delete(key);
      if (now() > deadline) return false;
      show(text);
      return true;
    },
  };
}

export type FlashStore = ReturnType<typeof createFlashStore>;

/** El único de la pestaña. Se usa solo en el navegador (efectos y manejadores de eventos). */
export const flashStore = createFlashStore();
