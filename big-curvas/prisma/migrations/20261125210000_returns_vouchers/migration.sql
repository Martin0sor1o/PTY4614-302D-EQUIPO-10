-- Cambios, devoluciones y vales (ADR-021). SOLO AGREGA: no hay DROP ni se tocan los triggers, los CHECK ni los índices
-- existentes (incluido cash_sessions_one_open_per_location_idx). `ALTER TYPE … ADD VALUE` va en la misma migración porque
-- nada de lo que sigue (CHECK, triggers) usa el valor nuevo; el valor se usa recién en transacciones posteriores.
-- Las FK financieras (returns.approval_id / cash_session_id / voucher_id / new_sale_id y payments.voucher_id) son ON DELETE RESTRICT.

-- ══════════ PARTE GENERADA (prisma migrate diff) ══════════
-- CreateEnum
CREATE TYPE "return_type" AS ENUM ('CAMBIO', 'DEVOLUCION');

-- CreateEnum
CREATE TYPE "return_reason" AS ENUM ('TALLA', 'FALLA', 'NO_ES_LO_ESPERADO', 'ARREPENTIMIENTO', 'OTRO');

-- CreateEnum
CREATE TYPE "return_refund_method" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'ANULACION_TRANSBANK', 'VALE', 'NINGUNO');

-- CreateEnum
CREATE TYPE "return_condition" AS ENUM ('VENDIBLE', 'DANADA');

-- CreateEnum
CREATE TYPE "voucher_movement_type" AS ENUM ('EMISION', 'CANJE', 'REPOSICION');

-- AlterEnum
ALTER TYPE "approval_type" ADD VALUE 'VALE_SOBRE_TOPE';

-- AlterTable
ALTER TABLE "sale_lines" ADD COLUMN     "returned_quantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "voucher_id" TEXT;

-- CreateTable
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "original_sale_id" TEXT NOT NULL,
    "type" "return_type" NOT NULL,
    "reason" "return_reason" NOT NULL,
    "reason_note" TEXT,
    "value_returned" INTEGER NOT NULL,
    "refund_method" "return_refund_method" NOT NULL,
    "refund_amount" INTEGER NOT NULL DEFAULT 0,
    "rounding_adjustment" INTEGER NOT NULL DEFAULT 0,
    "refund_reference" TEXT,
    "approval_id" TEXT,
    "cash_session_id" TEXT,
    "voucher_id" TEXT,
    "new_sale_id" TEXT,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_lines" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "sale_line_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "condition" "return_condition" NOT NULL,

    CONSTRAINT "return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "issued_location_id" TEXT NOT NULL,
    "initial_amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_movements" (
    "id" TEXT NOT NULL,
    "voucher_id" TEXT NOT NULL,
    "type" "voucher_movement_type" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "ref_type" "ref_type" NOT NULL,
    "ref_id" TEXT,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "returns_number_key" ON "returns"("number");

-- CreateIndex
CREATE UNIQUE INDEX "returns_approval_id_key" ON "returns"("approval_id");

-- CreateIndex
CREATE UNIQUE INDEX "returns_voucher_id_key" ON "returns"("voucher_id");

-- CreateIndex
CREATE UNIQUE INDEX "returns_new_sale_id_key" ON "returns"("new_sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "returns_idempotency_key_key" ON "returns"("idempotency_key");

-- CreateIndex
CREATE INDEX "returns_location_id_created_at_idx" ON "returns"("location_id", "created_at");

-- CreateIndex
CREATE INDEX "returns_original_sale_id_idx" ON "returns"("original_sale_id");

-- CreateIndex
CREATE INDEX "return_lines_sale_line_id_idx" ON "return_lines"("sale_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_lines_return_id_sale_line_id_key" ON "return_lines"("return_id", "sale_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers"("code");

-- CreateIndex
CREATE INDEX "vouchers_issued_location_id_created_at_idx" ON "vouchers"("issued_location_id", "created_at");

-- CreateIndex
CREATE INDEX "vouchers_expires_at_idx" ON "vouchers"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_movements_idempotency_key_key" ON "voucher_movements"("idempotency_key");

-- CreateIndex
CREATE INDEX "voucher_movements_voucher_id_created_at_idx" ON "voucher_movements"("voucher_id", "created_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_original_sale_id_fkey" FOREIGN KEY ("original_sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approval_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_new_sale_id_fkey" FOREIGN KEY ("new_sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_sale_line_id_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "sale_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_issued_location_id_fkey" FOREIGN KEY ("issued_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_movements" ADD CONSTRAINT "voucher_movements_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_movements" ADD CONSTRAINT "voucher_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ══════════ SQL MANUAL (Prisma no soporta CHECK ni triggers) ══════════

-- Nunca se devuelve más de lo vendido (red final de la concurrencia).
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_returned_chk"
  CHECK ("returned_quantity" >= 0 AND "returned_quantity" <= "quantity");

-- Un pago con vale lleva el vale, y solo ese.
ALTER TABLE "payments" ADD CONSTRAINT "payments_voucher_chk"
  CHECK (("method" = 'VALE') = ("voucher_id" IS NOT NULL));

-- Devoluciones: dinero coherente, caja solo en efectivo, tipo ⇔ forma de resolverlo, vale cuando corresponde.
ALTER TABLE "returns" ADD CONSTRAINT "returns_money_chk" CHECK (
  "value_returned" > 0 AND (
    ("refund_method" IN ('EFECTIVO', 'TRANSFERENCIA', 'ANULACION_TRANSBANK')
       AND "refund_amount" > 0 AND "refund_amount" = "value_returned" + "rounding_adjustment")
    OR ("refund_method" IN ('VALE', 'NINGUNO') AND "refund_amount" = 0 AND "rounding_adjustment" = 0)));
ALTER TABLE "returns" ADD CONSTRAINT "returns_cash_chk"
  CHECK (("refund_method" = 'EFECTIVO') = ("cash_session_id" IS NOT NULL));
ALTER TABLE "returns" ADD CONSTRAINT "returns_kind_chk" CHECK (
  ("type" = 'CAMBIO' AND "new_sale_id" IS NOT NULL AND "refund_method" = 'NINGUNO')
  OR ("type" = 'DEVOLUCION' AND "new_sale_id" IS NULL AND "refund_method" <> 'NINGUNO'));
ALTER TABLE "returns" ADD CONSTRAINT "returns_voucher_chk"
  CHECK ((("refund_method" = 'VALE') = ("voucher_id" IS NOT NULL)) OR "type" = 'CAMBIO');
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_quantity_chk" CHECK ("quantity" > 0);
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_amount_chk" CHECK ("amount" >= 0);

-- Vales: monto y saldo coherentes; libro con movimientos reales.
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_amounts_chk"
  CHECK ("initial_amount" > 0 AND "balance" >= 0 AND "balance" <= "initial_amount");
ALTER TABLE "voucher_movements" ADD CONSTRAINT "voucher_movements_amount_chk" CHECK ("amount" <> 0);
ALTER TABLE "voucher_movements" ADD CONSTRAINT "voucher_movements_balance_after_chk" CHECK ("balance_after" >= 0);
-- El tipo fija el signo: la emisión y la reposición suman, el canje resta.
ALTER TABLE "voucher_movements" ADD CONSTRAINT "voucher_movements_type_sign_chk"
  CHECK (("type" IN ('EMISION', 'REPOSICION') AND "amount" > 0) OR ("type" = 'CANJE' AND "amount" < 0));

-- Ajuste 4: índice parcial para "¿en qué ventas se canjeó este vale?" (la mayoría de los pagos no lleva vale).
-- Prisma no conoce los índices parciales: al generar migraciones futuras hay que quitar cualquier DROP INDEX de este.
CREATE INDEX "payments_voucher_id_idx" ON "payments"("voucher_id") WHERE "voucher_id" IS NOT NULL;

-- ── voucher_movements es INMUTABLE: solo INSERT (igual que inventory_movements) ──
CREATE FUNCTION "voucher_movements_block_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'voucher_movements es inmutable: % no permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "voucher_movements_immutable"
  BEFORE UPDATE OR DELETE ON "voucher_movements"
  FOR EACH ROW EXECUTE FUNCTION "voucher_movements_block_mutation"();

-- ── vouchers: sin borrado físico y sin cambiar su identidad (solo cambian balance, active, updated_at) ──
CREATE FUNCTION "vouchers_block_identity_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'vouchers no se borra: se desactiva (active = false)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."code" IS DISTINCT FROM OLD."code"
     OR NEW."initial_amount" IS DISTINCT FROM OLD."initial_amount"
     OR NEW."expires_at" IS DISTINCT FROM OLD."expires_at"
     OR NEW."issued_location_id" IS DISTINCT FROM OLD."issued_location_id"
     OR NEW."created_by" IS DISTINCT FROM OLD."created_by" THEN
    RAISE EXCEPTION 'vouchers: código, monto inicial, vencimiento y origen no se modifican'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "vouchers_protect"
  BEFORE UPDATE OR DELETE ON "vouchers"
  FOR EACH ROW EXECUTE FUNCTION "vouchers_block_identity_change"();
