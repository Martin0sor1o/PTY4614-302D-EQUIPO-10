import type { Metadata } from "next";
import { Geist_Mono, Nunito_Sans, Playfair_Display } from "next/font/google";
import { RAIL_INIT_SCRIPT } from "@/components/layout/rail-pref";
import "./globals.css";

// Tipografías (Etapa 8): Playfair Display solo para títulos grandes y la marca; Nunito Sans para todo lo demás.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const nunito = Nunito_Sans({
  variable: "--font-nunito",
  subsets: ["latin"],
});

// Solo para códigos (SKU, N.º de documento).
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Big Curvas", template: "%s · Big Curvas" },
  description: "Inventario, POS y pedidos online de Big Curvas",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-CL"
      suppressHydrationWarning
      className={`${playfair.variable} ${nunito.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Lee la preferencia del riel antes del primer pintado (sin parpadeo). */}
        <script dangerouslySetInnerHTML={{ __html: RAIL_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
