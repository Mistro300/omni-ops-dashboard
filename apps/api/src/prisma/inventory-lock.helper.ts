import { Prisma } from '@prisma/client';

export interface InventoryLockKey {
  productId: string;
  warehouseId: string;
}

export interface LockedInventoryRow {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  reorder_point: number;
  version: number;
}

/**
 * Acquires row-level `FOR UPDATE` locks on `inventory_levels` inside an active
 * Prisma transaction in strict canonical order (`product_id ASC, warehouse_id ASC`).
 *
 * Canonical ordering prevents circular wait deadlocks when concurrent multi-item
 * orders or inter-warehouse stock transfers touch overlapping product/warehouse pairs.
 */
export async function lockInventoryLevelsOrdered(
  tx: Prisma.TransactionClient,
  keys: InventoryLockKey[],
): Promise<LockedInventoryRow[]> {
  if (keys.length === 0) {
    return [];
  }

  // Deduplicate and deterministically sort before issuing the lock query
  const uniqueMap = new Map<string, InventoryLockKey>();
  for (const key of keys) {
    uniqueMap.set(`${key.productId}:${key.warehouseId}`, key);
  }

  const sortedKeys = Array.from(uniqueMap.values()).sort((a, b) => {
    const productCmp = a.productId.localeCompare(b.productId);
    return productCmp !== 0 ? productCmp : a.warehouseId.localeCompare(b.warehouseId);
  });

  const tuples = sortedKeys.map(
    (k) => Prisma.sql`(${k.productId}::uuid, ${k.warehouseId}::uuid)`,
  );

  return tx.$queryRaw<LockedInventoryRow[]>`
    SELECT
      id,
      product_id,
      warehouse_id,
      quantity_on_hand,
      quantity_reserved,
      reorder_point,
      version
    FROM inventory_levels
    WHERE (product_id, warehouse_id) IN (${Prisma.join(tuples)})
    ORDER BY product_id ASC, warehouse_id ASC
    FOR UPDATE
  `;
}
