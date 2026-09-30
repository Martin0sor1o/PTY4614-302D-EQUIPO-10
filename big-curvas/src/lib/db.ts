import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

// Prisma solo debe usarse dentro de src/modules/*. Este archivo únicamente construye el cliente.

export type Tx = Prisma.TransactionClient;

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no está definida (ver .env.example)");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Reutiliza el cliente entre recargas en desarrollo (hot reload).
const globalForDb = globalThis as unknown as { __db?: PrismaClient };

export const db: PrismaClient = globalForDb.__db ?? createClient();

if (process.env.NODE_ENV !== "production") globalForDb.__db = db;
