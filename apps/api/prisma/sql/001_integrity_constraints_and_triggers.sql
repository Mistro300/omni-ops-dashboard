-- =============================================================================
-- OmniOps PostgreSQL Integrity, Partial Unique Indexes, Search & Append-Only Guards
-- Apply right after initial Prisma table creation (or as a dedicated Prisma migration).
-- =============================================================================

-- 1. Enable Trigram Extension for fast partial-text ILIKE search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Partial Unique Indexes for Soft-Deleted Entities
-- Allows re-creating a user email or product SKU after a prior record was soft-deleted
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active_unique
  ON users (LOWER(email))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_active_unique
  ON products (sku)
  WHERE deleted_at IS NULL;

-- 3. PostgreSQL CHECK Constraints on inventory_levels
-- Enforces physical inventory invariants at the database layer
ALTER TABLE inventory_levels
  DROP CONSTRAINT IF EXISTS chk_inventory_on_hand_non_negative,
  ADD CONSTRAINT chk_inventory_on_hand_non_negative
    CHECK (quantity_on_hand >= 0);

ALTER TABLE inventory_levels
  DROP CONSTRAINT IF EXISTS chk_inventory_reserved_non_negative,
  ADD CONSTRAINT chk_inventory_reserved_non_negative
    CHECK (quantity_reserved >= 0);

ALTER TABLE inventory_levels
  DROP CONSTRAINT IF EXISTS chk_inventory_on_hand_gte_reserved,
  ADD CONSTRAINT chk_inventory_on_hand_gte_reserved
    CHECK (quantity_on_hand >= quantity_reserved);

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS chk_products_prices_non_negative,
  ADD CONSTRAINT chk_products_prices_non_negative
    CHECK (unit_cost >= 0 AND unit_price >= 0);

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS chk_order_items_quantity_positive,
  ADD CONSTRAINT chk_order_items_quantity_positive
    CHECK (quantity > 0);

-- 4. GIN Trigram Indexes for High-Speed Search
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON products USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_sku_trgm
  ON products USING GIN (sku gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_number_trgm
  ON orders USING GIN (order_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING GIN (name gin_trgm_ops);

-- 5. True Append-Only Enforcement Triggers on stock_movements & audit_logs
CREATE OR REPLACE FUNCTION omniops_prevent_append_only_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table "%" is strictly append-only; % operations are forbidden.',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_movements_append_only ON stock_movements;
CREATE TRIGGER trg_stock_movements_append_only
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION omniops_prevent_append_only_mutation();

DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON audit_logs;
CREATE TRIGGER trg_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION omniops_prevent_append_only_mutation();
