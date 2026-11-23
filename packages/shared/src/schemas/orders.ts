import { z } from 'zod';
import { ORDER_STATUSES, type OrderStatus } from '../domain/order-state-machine';
import {
  bulkIdsSchema,
  createWhitelistedSortSchema,
  offsetPaginationQuerySchema,
} from './common';

export const CUSTOMER_SORT_FIELDS = ['name', 'email', 'companyName', 'createdAt'] as const;

export const ORDER_SORT_FIELDS = [
  'orderNumber',
  'totalAmount',
  'status',
  'createdAt',
  'updatedAt',
] as const;

export const ORDER_STATUS_VALUES = [
  ORDER_STATUSES.PENDING,
  ORDER_STATUSES.CONFIRMED,
  ORDER_STATUSES.SHIPPED,
  ORDER_STATUSES.DELIVERED,
  ORDER_STATUSES.CANCELLED,
  ORDER_STATUSES.REFUNDED,
] as const;

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Customer name is required').max(160),
  email: z.string().trim().toLowerCase().email('Valid email is required').max(255),
  phone: z.string().trim().max(40).optional().nullable(),
  companyName: z.string().trim().max(180).optional().nullable(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const customersQuerySchema = offsetPaginationQuerySchema.extend({
  sortBy: createWhitelistedSortSchema(CUSTOMER_SORT_FIELDS, 'createdAt'),
});

export const createOrderItemSchema = z.object({
  productId: z.string().uuid('Select a valid product'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(100_000),
});

export const createOrderSchema = z
  .object({
    customerId: z.string().uuid('Select a valid customer'),
    warehouseId: z.string().uuid('Select a valid warehouse'),
    items: z
      .array(createOrderItemSchema)
      .min(1, 'Order must contain at least one product')
      .max(50, 'Maximum 50 line items per order'),
    discountAmount: z.coerce.number().min(0).optional().default(0),
    taxRate: z.coerce.number().min(0).max(0.5).optional().default(0.14),
  })
  .refine(
    (data) => new Set(data.items.map((i) => i.productId)).size === data.items.length,
    {
      path: ['items'],
      message: 'Duplicate products in the same order are not allowed; combine quantities instead.',
    },
  );

export const transitionOrderStatusSchema = z
  .object({
    toStatus: z.enum(ORDER_STATUS_VALUES),
    reason: z.string().trim().max(500).optional(),
    restock: z.boolean().optional().default(true),
  })
  .refine(
    (data) => {
      if (data.toStatus === ORDER_STATUSES.CANCELLED || data.toStatus === ORDER_STATUSES.REFUNDED) {
        return Boolean(data.reason && data.reason.trim().length >= 3);
      }
      return true;
    },
    {
      path: ['reason'],
      message: 'A reason (at least 3 characters) is required for cancellation or refund.',
    },
  );

export const bulkOrderStatusSchema = bulkIdsSchema.extend({
  toStatus: z.enum(ORDER_STATUS_VALUES),
  reason: z.string().trim().max(500).optional(),
  restock: z.boolean().optional().default(true),
});

export const ordersQuerySchema = offsetPaginationQuerySchema.extend({
  sortBy: createWhitelistedSortSchema(ORDER_SORT_FIELDS, 'createdAt'),
  status: z.string().optional(), // Comma-separated OrderStatus values
  warehouseId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomersQuery = z.infer<typeof customersQuerySchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type TransitionOrderStatusInput = z.infer<typeof transitionOrderStatusSchema>;
export type BulkOrderStatusInput = z.infer<typeof bulkOrderStatusSchema>;
export type OrdersQuery = z.infer<typeof ordersQuerySchema>;

export interface CustomerListItemDto {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  orderCount: number;
  totalSpent: number;
  createdAt: string;
}

export interface OrderListItemDto {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerCompany: string | null;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  itemCount: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetailDto extends OrderListItemDto {
  customerEmail: string;
  customerPhone: string | null;
  cancellationReason: string | null;
  restockedOnRefund: boolean;
  createdByName: string;
  items: Array<{
    id: string;
    productId: string;
    productSku: string;
    productName: string;
    quantity: number;
    unitPriceSnapshot: number;
    unitCostSnapshot: number;
    lineTotal: number;
  }>;
  statusHistory: Array<{
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    reason: string | null;
    changedByName: string;
    createdAt: string;
  }>;
}
