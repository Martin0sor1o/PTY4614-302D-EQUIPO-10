import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isDemoMode } from "@/lib/demo";
import "./diseno.css";

// TEMPORAL (Etapa 8): referencia de la dirección elegida. Las fuentes ya salen del layout raíz (--font-playfair, --font-nunito).
export const metadata: Metadata = { title: "Dirección visual", robots: { index: false, follow: false } };

export default function DisenoLayout({ children }: { children: ReactNode }) {
  // Solo existe con DEMO_MODE. Es una página temporal: se elimina al cerrar la Etapa 8.
  if (!isDemoMode()) notFound();
  return <div className="min-h-full flex-1 bg-stone-200 text-stone-900">{children}</div>;
}
