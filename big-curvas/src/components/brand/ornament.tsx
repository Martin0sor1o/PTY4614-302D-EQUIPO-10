import { cn } from "@/lib/utils";

/** Adorno de arcos (SVG propio): firma visual de la marca para cabeceras y estados vacíos. Hereda `currentColor`. */
export function Ornament({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 120 40" className={cn("h-10 w-auto", className)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 36 C 6 14, 30 4, 60 4 S 114 14, 114 36" />
      <path d="M22 36 C 22 20, 40 12, 60 12 S 98 20, 98 36" opacity=".6" />
      <path d="M38 36 C 38 28, 48 22, 60 22 S 82 28, 82 36" opacity=".35" />
    </svg>
  );
}
