import { z } from 'zod';
import type { OrderStatus } from '../domain/order-state-machine';

export const ANALYTICS_RANGES = ['7d', '30d', '90d', '12m'] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export const ANALYTICS_GRANULARITIES = ['day', 'week', 'month'] as const;
export type AnalyticsGranularity = (typeof ANALYTICS_GRANULARITIES)[number];

export const analyticsQuerySchema = z.object({
  range: z.enum(ANALYTICS_RANGES).default('30d'),
  granularity: z.enum(ANALYTICS_GRANULARITIES).optional(),
  warehouseId: z.string().uuid().optional(),
  topProductsBy: z.enum(['revenue', 'quantity']).default('revenue'),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export interface KpiMetricDto {
  value: number;
  previousValue: number;
  deltaPct: number;
  sparkline: number[];
}

export interface RevenueTrendPointDto {
  bucket: string;
  label: string;
  revenue: number;
  profit: number;
  prevRevenue: number;
  prevProfit: number;
  orders: number;
}

export interface OrderStatusDistributionDto {
  status: OrderStatus;
  count: number;
  totalAmount: number;
}

export interface TopProductMetricDto {
  productId: string;
  sku: string;
  name: string;
  revenue: number;
  quantity: number;
  profit: number;
}

export interface WarehouseComparisonDto {
  warehouseId: string;
  code: string;
  name: string;
  salesValue: number;
  stockValue: number;
  totalUnits: number;
  ordersCount: number;
}

export interface StockFlowPointDto {
  bucket: string;
  label: string;
  stockIn: number;
  stockOut: number;
}

export interface AnalyticsOverviewDto {
  meta: {
    range: AnalyticsRange;
    granularity: AnalyticsGranularity;
    fromDate: string;
    toDate: string;
    warehouseId: string | null;
    cached: boolean;
    generatedAt: string;
  };
  kpis: {
    totalRevenue: KpiMetricDto;
    grossProfit: KpiMetricDto & { marginPct: number };
    totalOrders: KpiMetricDto & {
      completionRatePct: number;
      cancellationRatePct: number;
    };
    inventoryValuation: {
      value: number;
      totalUnits: number;
      lowStockCount: number;
      outOfStockCount: number;
      sparkline: number[];
    };
  };
  revenueTrend: RevenueTrendPointDto[];
  ordersByStatus: OrderStatusDistributionDto[];
  topProducts: TopProductMetricDto[];
  warehouseComparison: WarehouseComparisonDto[];
  stockMovementFlow: StockFlowPointDto[];
  lowStockAlerts: Array<{
    id: string;
    productId: string;
    sku: string;
    productName: string;
    warehouseCode: string;
    available: number;
    reorderPoint: number;
    status: 'LOW_STOCK' | 'OUT_OF_STOCK';
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    warehouseCode: string;
    totalAmount: number;
    status: OrderStatus;
    createdAt: string;
  }>;
}
