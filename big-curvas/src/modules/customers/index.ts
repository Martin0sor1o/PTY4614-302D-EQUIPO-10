import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { assertAccess, type Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";

// Clientas (RF-CLI-01, versión simple de la demo): nombre, @instagram, teléfono, dirección y comuna.
// Solo ADMIN las gestiona (los pedidos online los registra solo Belén, RN-27).

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const newCustomerSchema = z.object({
  name: z.string().trim().min(2, "El nombre de la clienta es obligatorio").max(120),
  instagramHandle: text(60).transform((v) => (v ? v.replace(/^@+/, "") : v)),
  phone: text(30),
  address: text(200),
  commune: text(80),
});

export type NewCustomerInput = z.input<typeof newCustomerSchema>;

export interface CustomerSummary {
  id: string;
  name: string;
  instagramHandle: string | null;
  phone: string | null;
  address: string | null;
  commune: string | null;
}

const select = { id: true, name: true, instagramHandle: true, phone: true, address: true, commune: true } as const;

/** Crea la ficha dentro de la transacción de quien llama (el pedido). */
export async function createCustomer(
  tx: Pick<Tx, "customer">,
  input: { actor: Actor; customer: NewCustomerInput },
): Promise<CustomerSummary> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const c = parseInput(newCustomerSchema, input.customer);
  return tx.customer.create({
    data: {
      name: c.name,
      instagramHandle: c.instagramHandle ?? null,
      phone: c.phone ?? null,
      address: c.address ?? null,
      commune: c.commune ?? null,
    },
    select,
  });
}

export async function getCustomer(tx: Pick<Tx, "customer">, id: string): Promise<CustomerSummary> {
  const c = await tx.customer.findFirst({ where: { id, active: true }, select });
  if (!c) throw new AppError("NOT_FOUND", "La clienta no existe o está inactiva.", { customerId: id });
  return c;
}

/** Búsqueda por nombre, @instagram o teléfono. */
export async function searchCustomers(input: { actor: Actor; query: string; limit?: number }): Promise<CustomerSummary[]> {
  assertAccess(input.actor, { roles: ["ADMIN"] });
  const q = input.query.trim().replace(/^@+/, "");
  if (!q) return [];
  return db.customer.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { instagramHandle: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ],
    },
    select,
    orderBy: { name: "asc" },
    take: input.limit ?? 8,
  });
}
