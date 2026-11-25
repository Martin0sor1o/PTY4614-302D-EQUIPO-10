import type { ReactNode } from "react";
import { Ornament } from "@/components/brand/ornament";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";

/** Marco de las pantallas sin sesión o de acceso (login, vincular equipo, cambio de contraseña): cabecera de marca + contenido. */
export function AuthShell({ children, size = "lg" }: { children: ReactNode; size?: "md" | "lg" }) {
  return (
    <main className={cn("mx-auto flex w-full flex-1 flex-col justify-center gap-5 px-4 py-10", size === "md" ? "max-w-md" : "max-w-2xl")}>
      <div className="relative overflow-hidden rounded-3xl bg-brand-black px-6 py-9 text-center text-brand-pink shadow-soft">
        <Ornament className="mx-auto mb-4 h-8 text-brand-pink/60" />
        <h1 className="flex justify-center">
          <Wordmark size="lg" tone="onDark" />
        </h1>
        <p className="mt-4 text-sm">Inventario, POS y pedidos online</p>
      </div>
      {children}
    </main>
  );
}
