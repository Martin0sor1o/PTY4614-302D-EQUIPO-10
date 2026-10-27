import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Cormorant_Garamond, DM_Sans, Figtree, Fraunces, Jost, Manrope } from "next/font/google";
import { isDemoMode } from "@/lib/demo";
import { cn } from "@/lib/utils";
import "./diseno.css";

// TEMPORAL (Etapa 8, Fase A): se cargan las fuentes de las tres direcciones; al elegir una se quitan las otras.
const aDisplay = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], style: ["normal", "italic"], variable: "--font-a-display" });
const aBody = Figtree({ subsets: ["latin"], variable: "--font-a-body" });
const bDisplay = Fraunces({ subsets: ["latin"], axes: ["SOFT", "opsz"], variable: "--font-b-display" });
const bBody = DM_Sans({ subsets: ["latin"], variable: "--font-b-body" });
const cDisplay = Jost({ subsets: ["latin"], variable: "--font-c-display" });
const cBody = Manrope({ subsets: ["latin"], variable: "--font-c-body" });

export const metadata: Metadata = { title: "Direcciones visuales", robots: { index: false, follow: false } };

export default function DisenoLayout({ children }: { children: ReactNode }) {
  // Solo existe con DEMO_MODE. Aun así es una página temporal: se elimina al cerrar la Etapa 8.
  if (!isDemoMode()) notFound();
  return (
    <div
      className={cn(
        aDisplay.variable, aBody.variable, bDisplay.variable, bBody.variable, cDisplay.variable, cBody.variable,
        "min-h-full flex-1 bg-stone-200 text-stone-900",
      )}
    >
      {children}
    </div>
  );
}
