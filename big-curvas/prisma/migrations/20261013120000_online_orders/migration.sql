-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "shipping_cost" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "address" TEXT,
ADD COLUMN     "commune" TEXT;

-- AlterTable
ALTER TABLE "online_orders" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by" TEXT;

-- AlterTable
ALTER TABLE "online_order_lines" ADD COLUMN     "discount_bps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "value_text" TEXT,
ALTER COLUMN "value_int" DROP NOT NULL;

-- CreateTable
CREATE TABLE "online_order_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" "order_status" NOT NULL,
    "user_id" TEXT NOT NULL,
    "note" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "online_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_order_events_idempotency_key_key" ON "online_order_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "online_order_events_order_id_created_at_idx" ON "online_order_events"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "online_order_lines_order_id_variant_id_key" ON "online_order_lines"("order_id", "variant_id");

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_events" ADD CONSTRAINT "online_order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "online_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_events" ADD CONSTRAINT "online_order_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ══════════ SQL MANUAL (Prisma no soporta CHECK ni triggers de forma nativa) ══════════

-- Envío dentro del total de la venta y del pedido (docs/04: sales.shipping_cost, P-29 pendiente con el contador).
-- El pago de la venta es total (+ redondeo en efectivo), así que SUM(payments) = total + rounding_adjustment se mantiene.
ALTER TABLE "sales" ADD CONSTRAINT "sales_shipping_chk" CHECK ("shipping_cost" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_total_chk" CHECK ("total" = "subtotal" - "discount_total" + "shipping_cost");
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_total_chk" CHECK ("total" = "subtotal" - "discount_total" + "shipping_cost");
ALTER TABLE "online_order_lines" ADD CONSTRAINT "online_order_lines_discount_bps_chk" CHECK ("discount_bps" BETWEEN 0 AND 10000);

-- settings: value_int o value_text (al menos uno).
ALTER TABLE "settings" ADD CONSTRAINT "settings_value_chk" CHECK ("value_int" IS NOT NULL OR "value_text" IS NOT NULL);

-- online_order_events es solo INSERT (historial de estados e idempotencia): un trigger rechaza UPDATE y DELETE.
CREATE FUNCTION "online_order_events_block_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'online_order_events es de solo inserción: % no permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "online_order_events_immutable"
  BEFORE UPDATE OR DELETE ON "online_order_events"
  FOR EACH ROW EXECUTE FUNCTION "online_order_events_block_mutation"();
