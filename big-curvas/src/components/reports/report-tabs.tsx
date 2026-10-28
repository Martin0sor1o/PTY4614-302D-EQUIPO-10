import Link from "next/link";
import { cn } from "@/lib/utils";

export const REPORT_TABS = [
  { id: "ventas", label: "Ventas" },
  { id: "mas-vendidos", label: "Más vendidos" },
  { id: "stock-bajo", label: "Stock bajo" },
  { id: "sin-rotacion", label: "Sin rotación" },
  { id: "viernes", label: "Lista del viernes" },
] as const;

export type ReportTabId = (typeof REPORT_TABS)[number]["id"];

/** Pestañas por URL (`?tab=`): se pueden marcar, compartir e imprimir; en el celular se desplazan de lado. */
export function ReportTabs({ active, query }: { active: ReportTabId; query: Record<string, string | undefined> }) {
  const href = (tab: ReportTabId) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
    params.set("tab", tab);
    return `/reportes?${params.toString()}`;
  };
  return (
    <nav aria-label="Reportes" className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 print:hidden">
      <ul className="flex w-max gap-2 md:w-auto md:flex-wrap">
        {REPORT_TABS.map((t) => (
          <li key={t.id}>
            <Link
              href={href(t.id)}
              aria-current={t.id === active ? "page" : undefined}
              className={cn(
                "flex items-center rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors max-md:min-h-11",
                t.id === active ? "border-brand-black bg-brand-black text-brand-pink" : "border-input bg-card text-foreground hover:bg-secondary",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
