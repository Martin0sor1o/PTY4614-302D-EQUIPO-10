import { db } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { expireStale, loadView, toView, viewSelect } from "./internal";
import type { ApprovalView, ApproverOption } from "./types";

// Consultas de lectura. Todas aplican antes el vencimiento (sin job): lo vencido se informa como VENCIDA.

/** Estado de una solicitud para la caja que espera (consulta cada ~3 s). VENDEDORA: solo de su ubicación; ADMIN: cualquiera. */
export async function getApprovalStatus(input: { actor: Actor; approvalId: string }): Promise<ApprovalView> {
  assertAccess(input.actor, { roles: ["VENDEDORA", "ADMIN"] });
  await expireStale(db);
  const view = await loadView(db, input.approvalId);
  assertAccess(input.actor, { roles: ["VENDEDORA", "ADMIN"], locationId: view.locationId });
  return view;
}

/** Bandeja de Belén (/aprobaciones): pendientes (más antiguas primero) y las últimas decididas. Solo ADMIN. */
export async function listApprovals(input: { actor: Actor; historyLimit?: number }): Promise<{ pending: ApprovalView[]; recent: ApprovalView[] }> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  await expireStale(db);
  const pending = await db.approvalRequest.findMany({ where: { status: "PENDIENTE" }, orderBy: { createdAt: "asc" }, select: viewSelect });
  const recent = await db.approvalRequest.findMany({
    where: { status: { not: "PENDIENTE" } },
    orderBy: { createdAt: "desc" },
    take: input.historyLimit ?? 15,
    select: viewSelect,
  });
  return { pending: pending.map((r) => toView(r)), recent: recent.map((r) => toView(r)) };
}

/** Contador del menú de Belén. */
export async function countPendingApprovals(): Promise<number> {
  await expireStale(db);
  return db.approvalRequest.count({ where: { status: "PENDIENTE" } });
}

/** Administradoras que pueden aprobar con PIN en el equipo de la caja (en la demo, solo Belén). */
export async function listApprovers(input: { actor: Actor }): Promise<ApproverOption[]> {
  assertAccess(input.actor, { roles: ["VENDEDORA", "ADMIN"] });
  const rows = await db.user.findMany({
    where: { role: "ADMIN", active: true, pinHash: { not: null } },
    select: { id: true, name: true, pinLockedUntil: true },
    orderBy: { name: "asc" },
  });
  const now = new Date();
  return rows.map((r) => ({ id: r.id, name: r.name, lockedUntil: r.pinLockedUntil && r.pinLockedUntil > now ? r.pinLockedUntil : null }));
}
