"use client";

import type { ReactNode } from "react";
import { logoutAction } from "@/app/(app)/session-actions";
import { clearSensitiveOnLogout } from "@/lib/pending-attempt";

/** El formulario de "Salir". Antes de cerrar la sesión borra de la pestaña el código de vale de cualquier envío guardado. */
export function LogoutForm({ children }: { children: ReactNode }) {
  return (
    <form
      action={logoutAction}
      onSubmit={() => {
        try {
          clearSensitiveOnLogout(window.sessionStorage);
        } catch {
          // sin sessionStorage no hay nada guardado
        }
      }}
    >
      {children}
    </form>
  );
}
