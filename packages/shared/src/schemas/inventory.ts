import { z } from 'zod';
import { STOCK_MOVEMENT_TYPES, type StockMovementType } from '../domain/order-state-machine';
import {
  createWhitelistedSortSchema,
  cursorPaginationQuerySchema,
  offsetPaginationQuerySchema,
} from './common';
import { STOCK_HEALTH_VALUES, type StockHealthFilter } from './products';

export const INVENTORY_SORT_FIELDS = [
  'quantityOnHand',
  'quantityReserved',
  'reorderPoint',
  'updatedAt',
] as const;

export const inventoryQuerySchema = offsetPaginationQuerySchema.extend({
  sortBy: createWhitelistedSortSchema(INVENTORY_SORT_FIELDS, 'updatedAt'),
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  stockHealth: z.enum(STOCK_HEALTH_VALUES).optional(),
});

export const adjustStockSchema = z.object({
  productId: z.string().uuid('Select a valid product'),
  warehouseId: z.string().uuid('Select a valid warehouse'),
  mode: z.enum(['ADD', 'DEDUCT']),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(1_000_000),
  reason: z.string().trim().min(3, 'Reason is required (min 3 characters)').max(500),
  reorderPoint: z.coerce.number().int().min(0).max(100_000).optional(),
});

export const transferStockSchema = z
  .object({
    productId: z.string().uuid('Select a valid product'),
    fromWarehouseId: z.string().uuid('Select source warehouse'),
    toWarehouseId: z.string().uuid('Select destination warehouse'),
    quantity: z.coerce.number().int().min(1, 'Transfer quantity must be at least 1').max(1_000_000),
    reason: z.string().trim().min(3, 'Transfer reason is required').max(500),
  })
  .refine((data) => data.fromWarehouseId !== data.toWarehouseId, {
    path: ['toWarehouseId'],
    message: 'Destination warehouse must differ from source warehouse',
  });

export const stockMovementsQuerySchema = cursorPaginationQuerySchema.extend({
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  type: z
    .enum([
      STOCK_MOVEMENT_TYPES.IN,
      STOCK_MOVEMENT_TYPES.OUT,
      STOCK_MOVEMENT_TYPES.ADJUSTMENT,
      STOCK_MOVEMENT_TYPES.TRANSFER_IN,
      STOCK_MOVEMENT_TYPES.TRANSFER_OUT,
    ])
    .optional(),
  fromDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  toDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
});

export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type TransferStockInput = z.infer<typeof transferStockSchema>;
export type StockMovementsQuery = z.infer<typeof stockMovementsQuerySchema>;

export interface InventoryLevelDto {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  reorderPoint: number;
  stockHealth: StockHealthFilter;
  version: number;
  updatedAt: string;
}

export interface StockMovementDto {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  type: StockMovementType;
  quantityDelta: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string | null;
  reason: string | null;
  performedById: string;
  performedByName: string;
  createdAt: string;
}
