import { z } from 'zod';
import {
  bulkIdsSchema,
  createWhitelistedSortSchema,
  offsetPaginationQuerySchema,
} from './common';

export const STOCK_HEALTH_VALUES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;
export type StockHealthFilter = (typeof STOCK_HEALTH_VALUES)[number];

export const PRODUCT_SORT_FIELDS = [
  'sku',
  'name',
  'unitCost',
  'unitPrice',
  'isActive',
  'updatedAt',
  'createdAt',
] as const;

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Category name is too short').max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Slug must contain lowercase letters, numbers, and hyphens only')
    .min(2)
    .max(140),
  parentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createWarehouseSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]+$/, 'Warehouse code must use uppercase letters, numbers, and hyphens')
    .min(2)
    .max(32),
  name: z.string().trim().min(2).max(160),
  location: z.string().trim().min(2).max(255),
  isActive: z.boolean().optional().default(true),
});

export const updateWarehouseSchema = createWarehouseSchema.partial();

export const createProductSchema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-_]+$/, 'SKU may contain uppercase letters, numbers, hyphens, and underscores')
    .min(2)
    .max(64),
  name: z.string().trim().min(2).max(220),
  categoryId: z.string().uuid('Select a valid category'),
  unitCost: z.coerce.number().min(0, 'Unit cost cannot be negative'),
  unitPrice: z.coerce.number().min(0, 'Unit price cannot be negative'),
  isActive: z.boolean().optional().default(true),
  defaultReorderPoint: z.coerce.number().int().min(0).max(100000).optional().default(10),
});

export const updateProductSchema = createProductSchema.omit({ defaultReorderPoint: true }).partial();

export const productsQuerySchema = offsetPaginationQuerySchema.extend({
  sortBy: createWhitelistedSortSchema(PRODUCT_SORT_FIELDS, 'updatedAt'),
  categoryId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  stockHealth: z.enum(STOCK_HEALTH_VALUES).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
});

export const bulkProductsStatusSchema = bulkIdsSchema.extend({
  isActive: z.boolean(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductsQuery = z.infer<typeof productsQuerySchema>;
export type BulkProductsStatusInput = z.infer<typeof bulkProductsStatusSchema>;

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
  productCount?: number;
}

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  location: string;
  isActive: boolean;
  skuCount?: number;
  totalUnits?: number;
  createdAt: string;
}

export interface ProductListItemDto {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unitCost: number;
  unitPrice: number;
  isActive: boolean;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  stockHealth: StockHealthFilter;
  updatedAt: string;
}

export interface ProductDetailDto extends ProductListItemDto {
  createdAt: string;
  inventoryByWarehouse: Array<{
    id: string;
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    quantityOnHand: number;
    quantityReserved: number;
    quantityAvailable: number;
    reorderPoint: number;
    stockHealth: StockHealthFilter;
    updatedAt: string;
  }>;
  recentMovements: Array<{
    id: string;
    warehouseCode: string;
    type: string;
    quantityDelta: number;
    balanceAfter: number;
    referenceType: string;
    referenceId: string | null;
    reason: string | null;
    actorName: string;
    createdAt: string;
  }>;
}
