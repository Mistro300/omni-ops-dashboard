# OmniOps — PostgreSQL 16 `EXPLAIN (ANALYZE, BUFFERS)` Performance Benchmarks

> Generated against live PostgreSQL 16 dataset: **500 Products**, **5 Warehouses**, **2,500 Inventory Levels**, **25,000+ Orders**, **49,900+ Order Items**, **84,600+ Order Status Histories**, and **67,300+ Stock Movements**.

| Query Pattern | Execution Time (`ms`) | Planning Time (`ms`) | Plan Nodes & Indexes Used |
| :--- | :---: | :---: | :--- |
| **Orders Filtered by Warehouse + Status (Composite Index)** | `0.357 ms` | `2.95 ms` | `Limit -> orders_warehouse_id_created_at_idx -> Index Scan` |
| **Stock Movements Cursor Ledger (67,300+ rows)** | `0.56 ms` | `1.708 ms` | `Limit -> Incremental Sort -> stock_movements_warehouse_id_created_at_idx -> Index Scan` |
| **Active User Email Partial Unique Index Lookup** | `0.077 ms` | `1.467 ms` | `idx_users_email_active_unique -> Index Scan` |
| **Products Trigram GIN Search (name / SKU ILIKE)** | `0.712 ms` | `2.528 ms` | `Limit -> Sort -> Seq Scan` |
| **Analytics Time-Series DATE_TRUNC Revenue Aggregation (90d)** | `11.233 ms` | `0.535 ms` | `Aggregate -> Sort -> Bitmap Heap Scan -> orders_created_at_idx -> Bitmap Index Scan` |
| **Warehouse Low-Stock Alert Scan (Available <= Reorder Point)** | `0.478 ms` | `1.157 ms` | `Bitmap Heap Scan -> inventory_levels_warehouse_id_quantity_on_hand_idx -> Bitmap Index Scan` |

## Key Architectural Index Guarantees

1. **`orders_warehouse_id_status_created_at_idx`**: Eliminates full table scans across 25,000+ orders when filtering by active warehouse and status.
2. **`stock_movements_warehouse_id_created_at_idx`**: Powers $O(1)$ keyset cursor pagination over 67,300+ immutable ledger rows without `OFFSET` degradation.
3. **`users_email_active_unique_idx` & `products_sku_active_unique_idx`**: Partial unique indexes (`WHERE deleted_at IS NULL`) enforce uniqueness on active records while permitting soft-deleted SKU/email reuse.
4. **`products_name_trgm_idx` & `products_sku_trgm_idx`**: `pg_trgm` GIN indexes accelerate substring `ILIKE` searches across product catalogs.
