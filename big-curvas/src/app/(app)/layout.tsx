import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth";
import { AppShell } from "@/components/layout/app-shell";
import { FlashRegion } from "@/components/feedback/flash-region";

// Todas las pantallas autenticadas pasan por aquí. Cada página además valida su rol (requirePageAccess).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <>
      <AppShell user={user}>{children}</AppShell>
      {/* Región de avisos: montada siempre para que el lector de pantalla anuncie lo que aparezca en ella. */}
      <FlashRegion />
    </>
  );
}
