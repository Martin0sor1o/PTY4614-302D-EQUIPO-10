-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_pin_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pin_hash" TEXT,
ADD COLUMN     "pin_locked_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "void_approval_id" TEXT,
ADD COLUMN     "void_cash_session_id" TEXT,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by" TEXT;

-- AlterTable
ALTER TABLE "online_orders" ADD COLUMN     "refund_method" TEXT,
ADD COLUMN     "refund_reference" TEXT,
ADD COLUMN     "refunded_at" TIMESTAMP(3),
ADD COLUMN     "refunded_by" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sales_void_approval_id_key" ON "sales"("void_approval_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_void_approval_id_fkey" FOREIGN KEY ("void_approval_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_void_cash_session_id_fkey" FOREIGN KEY ("void_cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_refunded_by_fkey" FOREIGN KEY ("refunded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ══════════ SQL MANUAL (Prisma no soporta CHECK) ══════════

-- Una venta está ANULADA si y solo si tiene fecha de anulación (RN-12).
ALTER TABLE "sales" ADD CONSTRAINT "sales_void_chk" CHECK (("status" = 'ANULADA') = ("voided_at" IS NOT NULL));
-- Contador de intentos de PIN nunca negativo.
ALTER TABLE "users" ADD CONSTRAINT "users_failed_pin_attempts_chk" CHECK ("failed_pin_attempts" >= 0);
-- Un reembolso registrado siempre indica el medio.
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_refund_chk" CHECK ("refunded_at" IS NULL OR "refund_method" IS NOT NULL);
-- Monto aprobado nunca negativo.
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_amount_chk" CHECK ("amount" IS NULL OR "amount" >= 0);
