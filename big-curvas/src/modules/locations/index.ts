import { db } from "@/lib/db";
import type { SessionLocation } from "@/lib/access";

export interface LocationSummary extends SessionLocation {
  sellsPos: boolean;
  fulfillsOnline: boolean;
}

const ORDER = ["TIENDA_RANCAGUA", "TIENDA_PROVIDENCIA", "BODEGA"];

/** Ubicaciones activas, en orden fijo: Rancagua, Providencia, Bodega. */
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
    .sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code));
}

export async function getLocation(id: string): Promise<LocationSummary | null> {
  return (await listLocations()).find((l) => l.id === id) ?? null;
}
