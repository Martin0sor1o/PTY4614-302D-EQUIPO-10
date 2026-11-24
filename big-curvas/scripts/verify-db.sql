-- Verificación de solo lectura de la base de la demo (Neon u otra). No modifica nada.
-- Uso: pegar en el SQL Editor de Neon, o  psql "$DIRECT_URL" -f scripts/verify-db.sql
-- Devuelve una fila por comprobación (check_name, expected, found, status, faltantes). Todas deben salir OK.
-- Las listas esperadas salen de prisma/migrations; si se agrega una migración con tablas, CHECK, índices
-- o triggers nuevos, hay que regenerar estas listas.

WITH
expected_tables(name) AS (VALUES
    ('approval_requests'),
    ('audit_log'),
    ('cash_sessions'),
    ('categories'),
    ('colors'),
    ('customers'),
    ('document_counters'),
    ('inventory_movements'),
    ('locations'),
    ('online_order_events'),
    ('online_order_lines'),
    ('online_orders'),
    ('payments'),
    ('product_variants'),
    ('products'),
    ('reservations'),
    ('sale_lines'),
    ('sales'),
    ('settings'),
    ('sizes'),
    ('stock_levels'),
    ('transfer_lines'),
    ('transfers'),
    ('users')
),
expected_checks(name) AS (VALUES
    ('approval_requests_amount_chk'),
    ('cash_sessions_opening_cash_chk'),
    ('document_counters_last_value_chk'),
    ('inventory_movements_on_hand_after_chk'),
    ('inventory_movements_quantity_chk'),
    ('online_order_lines_discount_bps_chk'),
    ('online_order_lines_quantity_chk'),
    ('online_orders_refund_chk'),
    ('online_orders_total_chk'),
    ('payments_amount_chk'),
    ('payments_cash_received_chk'),
    ('reservations_quantity_chk'),
    ('sale_lines_quantity_chk'),
    ('sales_amounts_chk'),
    ('sales_shipping_chk'),
    ('sales_total_chk'),
    ('sales_void_chk'),
    ('settings_value_chk'),
    ('stock_levels_on_hand_chk'),
    ('stock_levels_reserved_chk'),
    ('stock_levels_reserved_lte_on_hand_chk'),
    ('transfer_lines_qty_received_chk'),
    ('transfer_lines_qty_sent_chk'),
    ('transfers_from_to_chk'),
    ('users_failed_pin_attempts_chk')
),
expected_indexes(name) AS (VALUES
    ('approval_requests_idempotency_key_key'),
    ('approval_requests_status_created_at_idx'),
    ('audit_log_entity_entity_id_idx'),
    ('cash_sessions_location_id_status_idx'),
    ('cash_sessions_one_open_per_location_idx'),
    ('colors_code_key'),
    ('inventory_movements_idempotency_key_key'),
    ('inventory_movements_variant_id_location_id_created_at_idx'),
    ('locations_code_key'),
    ('online_order_events_idempotency_key_key'),
    ('online_order_events_order_id_created_at_idx'),
    ('online_order_lines_order_id_idx'),
    ('online_order_lines_order_id_variant_id_key'),
    ('online_orders_idempotency_key_key'),
    ('online_orders_number_key'),
    ('online_orders_pickup_location_id_status_idx'),
    ('online_orders_status_created_at_idx'),
    ('product_variants_barcode_key'),
    ('product_variants_product_id_size_id_color_id_key'),
    ('product_variants_sku_key'),
    ('products_model_code_key'),
    ('reservations_order_line_id_idx'),
    ('reservations_status_expires_at_idx'),
    ('reservations_variant_id_location_id_status_idx'),
    ('sales_channel_created_at_idx'),
    ('sales_idempotency_key_key'),
    ('sales_location_id_created_at_idx'),
    ('sales_number_key'),
    ('sales_online_order_id_key'),
    ('sales_void_approval_id_key'),
    ('sizes_code_key'),
    ('stock_levels_location_id_variant_id_idx'),
    ('transfer_lines_transfer_id_variant_id_key'),
    ('transfers_idempotency_key_key'),
    ('transfers_number_key'),
    ('transfers_status_from_location_id_idx'),
    ('transfers_status_to_location_id_idx'),
    ('users_email_key')
),
expected_triggers(name, tbl) AS (VALUES
    ('inventory_movements_immutable', 'inventory_movements'),
    ('online_order_events_immutable', 'online_order_events')
),
results AS (
  SELECT 'tablas' AS check_name,
         (SELECT count(*) FROM expected_tables)::int AS expected,
         (SELECT count(*) FROM expected_tables e JOIN pg_tables t ON t.tablename = e.name AND t.schemaname = 'public')::int AS found,
         COALESCE((SELECT string_agg(e.name, ', ') FROM expected_tables e LEFT JOIN pg_tables t ON t.tablename = e.name AND t.schemaname = 'public' WHERE t.tablename IS NULL), '') AS missing
  UNION ALL
  SELECT 'constraints CHECK',
         (SELECT count(*) FROM expected_checks)::int,
         (SELECT count(*) FROM expected_checks e JOIN pg_constraint c ON c.conname = e.name AND c.contype = 'c')::int,
         COALESCE((SELECT string_agg(e.name, ', ') FROM expected_checks e LEFT JOIN pg_constraint c ON c.conname = e.name AND c.contype = 'c' WHERE c.conname IS NULL), '')
  UNION ALL
  SELECT 'índices',
         (SELECT count(*) FROM expected_indexes)::int,
         (SELECT count(*) FROM expected_indexes e JOIN pg_indexes i ON i.indexname = e.name AND i.schemaname = 'public')::int,
         COALESCE((SELECT string_agg(e.name, ', ') FROM expected_indexes e LEFT JOIN pg_indexes i ON i.indexname = e.name AND i.schemaname = 'public' WHERE i.indexname IS NULL), '')
  UNION ALL
  -- El trigger debe existir, estar habilitado (tgenabled = 'O'), ser por fila, BEFORE y de UPDATE y DELETE (sin INSERT).
  SELECT 'triggers de inmutabilidad (BEFORE UPDATE OR DELETE, por fila, habilitados)',
         (SELECT count(*) FROM expected_triggers)::int,
         (SELECT count(*) FROM expected_triggers e
            JOIN pg_trigger g ON g.tgname = e.name AND NOT g.tgisinternal
            JOIN pg_class c ON c.oid = g.tgrelid AND c.relname = e.tbl
           WHERE g.tgenabled = 'O'
             AND (g.tgtype & 1) = 1      -- por fila
             AND (g.tgtype & 2) = 2      -- BEFORE
             AND (g.tgtype & 8) = 8      -- DELETE
             AND (g.tgtype & 16) = 16    -- UPDATE
             AND (g.tgtype & 4) = 0      -- sin INSERT
         )::int,
         COALESCE((SELECT string_agg(e.name, ', ') FROM expected_triggers e WHERE NOT EXISTS (
            SELECT 1 FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
             WHERE g.tgname = e.name AND c.relname = e.tbl AND g.tgenabled = 'O' AND NOT g.tgisinternal)), '')
  UNION ALL
  SELECT 'migraciones aplicadas (terminadas, sin revertir)',
         4,
         (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int,
         ''
)
SELECT check_name,
       expected,
       found,
       CASE WHEN expected = found THEN 'OK' ELSE 'FALLA' END AS status,
       missing AS faltantes
FROM results
ORDER BY check_name;
