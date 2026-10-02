import { db } from "@/lib/db";
import type { SessionLocation } from "@/lib/access";

export interface LocationSummary extends SessionLocation {
  sellsPos: boolean;
  fulfillsOnline: boolean;
}

const TYPE_ORDER = { STORE: 0, WAREHOUSE: 1 } as const;

/** Ubicaciones activas: primero las tiendas y al final la bodega; dentro de cada tipo, por nombre. */
export async function listLocations(): Promise<LocationSummary[]> {
  const rows = await db.location.findMany({ where: { active: true } });
  return rows
    .map((l) => ({
      id: l.id,
      code: l.code,
      name: l.name,
      type: l.type,
      sellsPos: l.sellsPos,
      fulfillsOnline: l.fulfillsOnline,
    }))
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name, "es"));
}

export async function getLocation(id: string): Promise<LocationSummary | null> {
  return (await listLocations()).find((l) => l.id === id) ?? null;
}
