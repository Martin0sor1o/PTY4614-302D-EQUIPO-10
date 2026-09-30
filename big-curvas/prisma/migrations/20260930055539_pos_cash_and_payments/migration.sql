-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "cash_received" INTEGER;

-- Una sola caja abierta por tienda (RF-POS-01). Prisma no soporta índices parciales: va a mano.
-- Protege incluso ante dos aperturas simultáneas.
CREATE UNIQUE INDEX "cash_sessions_one_open_per_location_idx" ON "cash_sessions"("location_id") WHERE "status" = 'ABIERTA';

-- Monto entregado en efectivo: nunca menor que lo cobrado (el vuelto no puede ser negativo).
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_received_chk" CHECK ("cash_received" IS NULL OR "cash_received" >= "amount");
