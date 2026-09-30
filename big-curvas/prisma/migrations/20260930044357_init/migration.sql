-- CreateEnum
CREATE TYPE "location_type" AS ENUM ('STORE', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'VENDEDORA', 'BODEGA');

-- CreateEnum
CREATE TYPE "barcode_source" AS ENUM ('PROVEEDOR', 'INTERNO');

-- CreateEnum
CREATE TYPE "movement_type" AS ENUM ('CARGA_INICIAL', 'RECEPCION', 'VENTA_POS', 'VENTA_ONLINE', 'DEVOLUCION', 'ANULACION_VENTA', 'AJUSTE', 'AJUSTE_CONTEO', 'MERMA', 'TRASPASO_SALIDA', 'TRASPASO_ENTRADA', 'MERMA_TRASPASO', 'REINGRESO_PEDIDO_CANCELADO', 'VENTA_CONTINGENCIA');

-- CreateEnum
CREATE TYPE "ref_type" AS ENUM ('SALE', 'RETURN', 'ONLINE_ORDER', 'GOODS_RECEIPT', 'STOCK_COUNT', 'TRANSFER', 'MANUAL');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('ACTIVA', 'CONSUMIDA', 'LIBERADA', 'VENCIDA', 'TRASPASADA');

-- CreateEnum
CREATE TYPE "transfer_status" AS ENUM ('BORRADOR', 'EN_TRANSITO', 'RECIBIDO', 'RECIBIDO_CON_DIFERENCIAS', 'CERRADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "transfer_reason" AS ENUM ('REPOSICION', 'PEDIDO_ONLINE', 'DEVOLUCION_A_BODEGA', 'OTRO');

-- CreateEnum
CREATE TYPE "difference_resolution" AS ENUM ('MERMA', 'REENVIO', 'ERROR_ENVIO');

-- CreateEnum
CREATE TYPE "cash_session_status" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "sale_channel" AS ENUM ('POS', 'INSTAGRAM', 'WHATSAPP', 'WEB');

-- CreateEnum
CREATE TYPE "sale_status" AS ENUM ('COMPLETADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA', 'VALE');

-- CreateEnum
CREATE TYPE "approval_type" AS ENUM ('REEMBOLSO', 'ANULACION', 'DESCUENTO_SOBRE_LIMITE', 'CAMBIO_FUERA_PLAZO', 'CAMBIO_SIN_BOLETA');

-- CreateEnum
CREATE TYPE "approval_status" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'VENCIDA', 'USADA');

-- CreateEnum
CREATE TYPE "approval_method" AS ENUM ('REMOTA', 'PIN');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('PENDIENTE_PAGO', 'PAGADO', 'ESPERANDO_TRASPASO', 'LISTO_PARA_PREPARAR', 'PREPARADO', 'DESPACHADO', 'EN_CAMINO_A_TIENDA', 'LISTO_PARA_RETIRO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "delivery_method" AS ENUM ('DESPACHO', 'RETIRO_TIENDA');

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "location_type" NOT NULL,
    "address" TEXT,
    "sells_pos" BOOLEAN NOT NULL DEFAULT false,
    "fulfills_online" BOOLEAN NOT NULL DEFAULT false,
    "receives_suppliers" BOOLEAN NOT NULL DEFAULT true,
    "sale_prefix" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" "user_role" NOT NULL,
    "location_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sizes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colors" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "model_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" TEXT NOT NULL,
    "base_price" INTEGER NOT NULL,
    "base_cost" INTEGER,
    "low_stock_threshold" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "size_id" TEXT NOT NULL,
    "color_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "barcode_source" "barcode_source" NOT NULL DEFAULT 'PROVEEDOR',
    "price_override" INTEGER,
    "cost_override" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "variant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("variant_id","location_id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "type" "movement_type" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "on_hand_after" INTEGER NOT NULL,
    "unit_cost" INTEGER,
    "reason" TEXT,
    "ref_type" "ref_type" NOT NULL,
    "ref_id" TEXT,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "reservation_status" NOT NULL DEFAULT 'ACTIVA',
    "order_line_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "transfer_line_id" TEXT,
    "created_by" TEXT NOT NULL,
    "released_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "from_location_id" TEXT NOT NULL,
    "to_location_id" TEXT NOT NULL,
    "status" "transfer_status" NOT NULL DEFAULT 'BORRADOR',
    "reason" "transfer_reason" NOT NULL DEFAULT 'OTRO',
    "online_order_id" TEXT,
    "created_by" TEXT NOT NULL,
    "sent_by" TEXT,
    "sent_at" TIMESTAMP(3),
    "received_by" TEXT,
    "received_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_notes" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_lines" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "qty_sent" INTEGER NOT NULL,
    "qty_received" INTEGER,
    "order_line_id" TEXT,
    "reservation_id" TEXT,
    "difference_resolution" "difference_resolution",

    CONSTRAINT "transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "opened_by" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_cash" INTEGER NOT NULL,
    "closed_by" TEXT,
    "closed_at" TIMESTAMP(3),
    "expected_cash" INTEGER,
    "counted_cash" INTEGER,
    "difference" INTEGER,
    "notes" TEXT,
    "status" "cash_session_status" NOT NULL DEFAULT 'ABIERTA',

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "channel" "sale_channel" NOT NULL DEFAULT 'POS',
    "location_id" TEXT NOT NULL,
    "cash_session_id" TEXT,
    "seller_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "online_order_id" TEXT,
    "status" "sale_status" NOT NULL DEFAULT 'COMPLETADA',
    "subtotal" INTEGER NOT NULL,
    "discount_total" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "rounding_adjustment" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_lines" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "unit_cost" INTEGER,
    "manual_discount_bps" INTEGER NOT NULL DEFAULT 0,
    "manual_discount" INTEGER NOT NULL DEFAULT 0,
    "discount_approval_id" TEXT,
    "line_total" INTEGER NOT NULL,

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "method" "payment_method" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "type" "approval_type" NOT NULL,
    "location_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "amount" INTEGER,
    "status" "approval_status" NOT NULL DEFAULT 'PENDIENTE',
    "method" "approval_method" NOT NULL DEFAULT 'REMOTA',
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_comment" TEXT,
    "expires_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "used_ref_type" TEXT,
    "used_ref_id" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instagram_handle" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "rut" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "channel" "sale_channel" NOT NULL DEFAULT 'INSTAGRAM',
    "customer_id" TEXT NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'PENDIENTE_PAGO',
    "fulfillment_location_id" TEXT NOT NULL,
    "delivery_method" "delivery_method" NOT NULL,
    "pickup_location_id" TEXT,
    "shipping_address" TEXT,
    "shipping_cost" INTEGER NOT NULL DEFAULT 0,
    "subtotal" INTEGER NOT NULL,
    "discount_total" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "payment_method" "payment_method",
    "payment_reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "prepared_at" TIMESTAMP(3),
    "prepared_by" TEXT,
    "courier" TEXT,
    "tracking_number" TEXT,
    "shipped_at" TIMESTAMP(3),
    "arrived_at_store_at" TIMESTAMP(3),
    "store_received_by" TEXT,
    "delivered_at" TIMESTAMP(3),
    "delivered_by" TEXT,
    "picked_up_by_name" TEXT,
    "created_by" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "line_total" INTEGER NOT NULL,
    "source_location_id" TEXT NOT NULL,
    "picked_qty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "online_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value_int" INTEGER NOT NULL,
    "description" TEXT,
    "is_demo_value" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "location_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_counters" (
    "key" TEXT NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sizes_code_key" ON "sizes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "colors_code_key" ON "colors"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_model_code_key" ON "products"("model_code");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_barcode_key" ON "product_variants"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_product_id_size_id_color_id_key" ON "product_variants"("product_id", "size_id", "color_id");

-- CreateIndex
CREATE INDEX "stock_levels_location_id_variant_id_idx" ON "stock_levels"("location_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_idempotency_key_key" ON "inventory_movements"("idempotency_key");

-- CreateIndex
CREATE INDEX "inventory_movements_variant_id_location_id_created_at_idx" ON "inventory_movements"("variant_id", "location_id", "created_at");

-- CreateIndex
CREATE INDEX "reservations_status_expires_at_idx" ON "reservations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "reservations_order_line_id_idx" ON "reservations"("order_line_id");

-- CreateIndex
CREATE INDEX "reservations_variant_id_location_id_status_idx" ON "reservations"("variant_id", "location_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_number_key" ON "transfers"("number");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_idempotency_key_key" ON "transfers"("idempotency_key");

-- CreateIndex
CREATE INDEX "transfers_status_to_location_id_idx" ON "transfers"("status", "to_location_id");

-- CreateIndex
CREATE INDEX "transfers_status_from_location_id_idx" ON "transfers"("status", "from_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_lines_transfer_id_variant_id_key" ON "transfer_lines"("transfer_id", "variant_id");

-- CreateIndex
CREATE INDEX "cash_sessions_location_id_status_idx" ON "cash_sessions"("location_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_number_key" ON "sales"("number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_online_order_id_key" ON "sales"("online_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_idempotency_key_key" ON "sales"("idempotency_key");

-- CreateIndex
CREATE INDEX "sales_location_id_created_at_idx" ON "sales"("location_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_channel_created_at_idx" ON "sales"("channel", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_idempotency_key_key" ON "approval_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "approval_requests_status_created_at_idx" ON "approval_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "online_orders_number_key" ON "online_orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "online_orders_idempotency_key_key" ON "online_orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "online_orders_status_created_at_idx" ON "online_orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "online_orders_pickup_location_id_status_idx" ON "online_orders"("pickup_location_id", "status");

-- CreateIndex
CREATE INDEX "online_order_lines_order_id_idx" ON "online_order_lines"("order_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "colors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "online_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_transfer_line_id_fkey" FOREIGN KEY ("transfer_line_id") REFERENCES "transfer_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_online_order_id_fkey" FOREIGN KEY ("online_order_id") REFERENCES "online_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "online_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_online_order_id_fkey" FOREIGN KEY ("online_order_id") REFERENCES "online_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_discount_approval_id_fkey" FOREIGN KEY ("discount_approval_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_fulfillment_location_id_fkey" FOREIGN KEY ("fulfillment_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_pickup_location_id_fkey" FOREIGN KEY ("pickup_location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_prepared_by_fkey" FOREIGN KEY ("prepared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_delivered_by_fkey" FOREIGN KEY ("delivered_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_store_received_by_fkey" FOREIGN KEY ("store_received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_lines" ADD CONSTRAINT "online_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "online_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_lines" ADD CONSTRAINT "online_order_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_lines" ADD CONSTRAINT "online_order_lines_source_location_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════════
-- SQL MANUAL (Prisma no soporta CHECK ni triggers de forma nativa)
-- ══════════════════════════════════════════════════════════════════════

-- Usuarios: VENDEDORA y BODEGA deben tener ubicación asignada (solo ADMIN puede no tenerla)
ALTER TABLE "users" ADD CONSTRAINT "users_role_location_chk"
  CHECK ("role" = 'ADMIN' OR "location_id" IS NOT NULL);

-- Stock: nunca negativo; lo reservado nunca supera lo físico (CLAUDE.md regla 4 / arquitectura §5.1)
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_on_hand_chk" CHECK ("on_hand" >= 0);
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_reserved_chk" CHECK ("reserved" >= 0);
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_reserved_lte_on_hand_chk" CHECK ("reserved" <= "on_hand");

-- Movimientos: cantidad distinta de cero y saldo resultante no negativo
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_quantity_chk" CHECK ("quantity" <> 0);
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_on_hand_after_chk" CHECK ("on_hand_after" >= 0);

-- Reservas y traspasos
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_quantity_chk" CHECK ("quantity" > 0);
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_to_chk" CHECK ("from_location_id" <> "to_location_id");
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_qty_sent_chk" CHECK ("qty_sent" > 0);
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_qty_received_chk" CHECK ("qty_received" IS NULL OR "qty_received" >= 0);

-- Ventas y dinero (CLP enteros, nunca negativos)
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opening_cash_chk" CHECK ("opening_cash" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_amounts_chk" CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "total" >= 0);
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_quantity_chk" CHECK ("quantity" > 0);
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_amounts_chk"
  CHECK ("unit_price" >= 0 AND "manual_discount" >= 0 AND "line_total" >= 0);
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_discount_bps_chk"
  CHECK ("manual_discount_bps" BETWEEN 0 AND 10000);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_chk" CHECK ("amount" > 0);

-- Pedidos online
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_amounts_chk"
  CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "shipping_cost" >= 0 AND "total" >= 0);
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_pickup_chk"
  CHECK ("delivery_method" <> 'RETIRO_TIENDA' OR "pickup_location_id" IS NOT NULL);
ALTER TABLE "online_order_lines" ADD CONSTRAINT "online_order_lines_quantity_chk" CHECK ("quantity" > 0);
ALTER TABLE "online_order_lines" ADD CONSTRAINT "online_order_lines_picked_chk"
  CHECK ("picked_qty" >= 0 AND "picked_qty" <= "quantity");

-- Correlativos
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_last_value_chk" CHECK ("last_value" >= 0);

-- ── inventory_movements es INMUTABLE: solo INSERT (CLAUDE.md regla 2) ──
-- Un trigger por fila rechaza cualquier UPDATE o DELETE, aunque venga de SQL directo.
-- (TRUNCATE no dispara triggers por fila: se usa solo en el reinicio de datos de la demo y en los tests.)
CREATE FUNCTION "inventory_movements_block_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'inventory_movements es inmutable: % no permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "inventory_movements_immutable"
  BEFORE UPDATE OR DELETE ON "inventory_movements"
  FOR EACH ROW EXECUTE FUNCTION "inventory_movements_block_mutation"();
