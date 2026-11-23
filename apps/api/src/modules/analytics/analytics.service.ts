import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AnalyticsGranularity,
  AnalyticsOverviewDto,
  AnalyticsQuery,
  AnalyticsRange,
  OrderStatus,
} from '@omni-ops/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const ANALYTICS_CACHE_TTL_SECONDS = 300; // 5 minutes (invalidated immediately on mutations)

function resolveGranularity(range: AnalyticsRange, requested?: AnalyticsGranularity): AnalyticsGranularity {
  if (requested) return requested;
  if (range === '12m') return 'month';
  if (range === '90d') return 'week';
  return 'day';
}

function getRangeDays(range: AnalyticsRange): number {
  switch (range) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
    case '12m':
      return 365;
  }
}

function calcDeltaPct(current: number, previous: number): number {
  if (previous <= 0) {
    return current > 0 ? 100 : 0;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function formatBucketLabel(iso: string, granularity: AnalyticsGranularity): string {
  const d = new Date(iso);
  if (granularity === 'month') {
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getOverview(query: AnalyticsQuery): Promise<AnalyticsOverviewDto> {
    const granularity = resolveGranularity(query.range, query.granularity);
    const cacheKey = `analytics:overview:${query.range}:${granularity}:${query.warehouseId ?? 'ALL'}:${query.topProductsBy}`;

    const cached = await this.redis.getJson<AnalyticsOverviewDto>(cacheKey);
    if (cached) {
      return {
        ...cached,
        meta: { ...cached.meta, cached: true },
      };
    }

    const now = new Date();
    const days = getRangeDays(query.range);
    const fromDate = new Date(now.getTime() - days * 86_400_000);
    const prevFromDate = new Date(fromDate.getTime() - days * 86_400_000);

    // Safe whitelisted SQL literals for DATE_TRUNC & generate_series step
    const truncUnit =
      granularity === 'month' ? 'month' : granularity === 'week' ? 'week' : 'day';
    const stepInterval =
      granularity === 'month' ? '1 month' : granularity === 'week' ? '1 week' : '1 day';

    const whOrderFilter = query.warehouseId
      ? Prisma.sql`AND o.warehouse_id = ${query.warehouseId}::uuid`
      : Prisma.empty;
    const whMoveFilter = query.warehouseId
      ? Prisma.sql`AND sm.warehouse_id = ${query.warehouseId}::uuid`
      : Prisma.empty;
    const whInvFilter = query.warehouseId
      ? Prisma.sql`AND il.warehouse_id = ${query.warehouseId}::uuid`
      : Prisma.empty;

    const topOrderCol =
      query.topProductsBy === 'quantity' ? Prisma.sql`quantity DESC` : Prisma.sql`revenue DESC`;

    const [
      currentTrendRows,
      prevTrendRows,
      orderStatusRows,
      prevOrderTotals,
      topProductRows,
      warehouseRows,
      stockFlowRows,
      invSummaryRows,
      lowStockRows,
      recentOrdersRows,
    ] = await Promise.all([
      // 1. Current period bucketed revenue, profit & order count (zero-filled via generate_series)
      this.prisma.raw.$queryRaw<
        Array<{ bucket: Date; revenue: number; profit: number; orders: number }>
      >`
        WITH series AS (
          SELECT generate_series(
            date_trunc(${truncUnit}, ${fromDate}::timestamptz AT TIME ZONE 'UTC'),
            date_trunc(${truncUnit}, ${now}::timestamptz AT TIME ZONE 'UTC'),
            ${stepInterval}::interval
          ) AS bucket
        ),
        order_agg AS (
          SELECT
            date_trunc(${truncUnit}, o.created_at AT TIME ZONE 'UTC') AS bucket,
            COUNT(DISTINCT o.id)::int AS orders,
            COALESCE(SUM(oi.quantity * oi.unit_price_snapshot), 0)::float8 AS revenue,
            COALESCE(SUM(oi.quantity * (oi.unit_price_snapshot - oi.unit_cost_snapshot)), 0)::float8 AS profit
          FROM orders o
          INNER JOIN order_items oi ON oi.order_id = o.id
          WHERE o.created_at >= ${fromDate}::timestamptz
            AND o.created_at <= ${now}::timestamptz
            AND o.status NOT IN ('CANCELLED', 'REFUNDED')
            ${whOrderFilter}
          GROUP BY 1
        )
        SELECT
          s.bucket,
          COALESCE(a.revenue, 0)::float8 AS revenue,
          COALESCE(a.profit, 0)::float8 AS profit,
          COALESCE(a.orders, 0)::int AS orders
        FROM series s
        LEFT JOIN order_agg a ON a.bucket = s.bucket
        ORDER BY s.bucket ASC
      `,

      // 2. Previous period bucketed revenue & profit (for period-over-period comparison)
      this.prisma.raw.$queryRaw<
        Array<{ bucket: Date; revenue: number; profit: number; orders: number }>
      >`
        WITH series AS (
          SELECT generate_series(
            date_trunc(${truncUnit}, ${prevFromDate}::timestamptz AT TIME ZONE 'UTC'),
            date_trunc(${truncUnit}, ${fromDate}::timestamptz AT TIME ZONE 'UTC'),
            ${stepInterval}::interval
          ) AS bucket
        ),
        order_agg AS (
          SELECT
            date_trunc(${truncUnit}, o.created_at AT TIME ZONE 'UTC') AS bucket,
            COUNT(DISTINCT o.id)::int AS orders,
            COALESCE(SUM(oi.quantity * oi.unit_price_snapshot), 0)::float8 AS revenue,
            COALESCE(SUM(oi.quantity * (oi.unit_price_snapshot - oi.unit_cost_snapshot)), 0)::float8 AS profit
          FROM orders o
          INNER JOIN order_items oi ON oi.order_id = o.id
          WHERE o.created_at >= ${prevFromDate}::timestamptz
            AND o.created_at < ${fromDate}::timestamptz
            AND o.status NOT IN ('CANCELLED', 'REFUNDED')
            ${whOrderFilter}
          GROUP BY 1
        )
        SELECT
          s.bucket,
          COALESCE(a.revenue, 0)::float8 AS revenue,
          COALESCE(a.profit, 0)::float8 AS profit,
          COALESCE(a.orders, 0)::int AS orders
        FROM series s
        LEFT JOIN order_agg a ON a.bucket = s.bucket
        ORDER BY s.bucket ASC
      `,

      // 3. Orders by status (current period)
      this.prisma.raw.$queryRaw<Array<{ status: OrderStatus; count: number; total_amount: number }>>`
        SELECT
          o.status,
          COUNT(*)::int AS count,
          COALESCE(SUM(o.total_amount), 0)::float8 AS total_amount
        FROM orders o
        WHERE o.created_at >= ${fromDate}::timestamptz
          AND o.created_at <= ${now}::timestamptz
          ${whOrderFilter}
        GROUP BY o.status
        ORDER BY count DESC
      `,

      // 4. Previous period total orders count (all statuses for fair KPI comparison)
      this.prisma.raw.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM orders o
        WHERE o.created_at >= ${prevFromDate}::timestamptz
          AND o.created_at < ${fromDate}::timestamptz
          ${whOrderFilter}
      `,

      // 5. Top 10 Products (by revenue or quantity)
      this.prisma.raw.$queryRaw<
        Array<{
          product_id: string;
          sku: string;
          name: string;
          revenue: number;
          quantity: number;
          profit: number;
        }>
      >`
        SELECT
          p.id AS product_id,
          p.sku,
          p.name,
          COALESCE(SUM(oi.quantity * oi.unit_price_snapshot), 0)::float8 AS revenue,
          COALESCE(SUM(oi.quantity), 0)::int AS quantity,
          COALESCE(SUM(oi.quantity * (oi.unit_price_snapshot - oi.unit_cost_snapshot)), 0)::float8 AS profit
        FROM order_items oi
        INNER JOIN orders o ON o.id = oi.order_id
        INNER JOIN products p ON p.id = oi.product_id
        WHERE o.created_at >= ${fromDate}::timestamptz
          AND o.created_at <= ${now}::timestamptz
          AND o.status NOT IN ('CANCELLED', 'REFUNDED')
          ${whOrderFilter}
        GROUP BY p.id, p.sku, p.name
        ORDER BY ${topOrderCol}
        LIMIT 10
      `,

      // 6. Warehouse comparison (Sales Value vs Stock Valuation)
      this.prisma.raw.$queryRaw<
        Array<{
          warehouse_id: string;
          code: string;
          name: string;
          sales_value: number;
          orders_count: number;
          stock_value: number;
          total_units: number;
        }>
      >`
        WITH sales AS (
          SELECT
            o.warehouse_id,
            COALESCE(SUM(o.total_amount), 0)::float8 AS sales_value,
            COUNT(*)::int AS orders_count
          FROM orders o
          WHERE o.created_at >= ${fromDate}::timestamptz
            AND o.created_at <= ${now}::timestamptz
            AND o.status NOT IN ('CANCELLED', 'REFUNDED')
          GROUP BY o.warehouse_id
        ),
        stock AS (
          SELECT
            il.warehouse_id,
            COALESCE(SUM(il.quantity_on_hand * p.unit_cost), 0)::float8 AS stock_value,
            COALESCE(SUM(il.quantity_on_hand), 0)::int AS total_units
          FROM inventory_levels il
          INNER JOIN products p ON p.id = il.product_id AND p.deleted_at IS NULL
          GROUP BY il.warehouse_id
        )
        SELECT
          w.id AS warehouse_id,
          w.code,
          w.name,
          COALESCE(s.sales_value, 0)::float8 AS sales_value,
          COALESCE(s.orders_count, 0)::int AS orders_count,
          COALESCE(st.stock_value, 0)::float8 AS stock_value,
          COALESCE(st.total_units, 0)::int AS total_units
        FROM warehouses w
        LEFT JOIN sales s ON s.warehouse_id = w.id
        LEFT JOIN stock st ON st.warehouse_id = w.id
        WHERE w.is_active = true
        ORDER BY w.code ASC
      `,

      // 7. Stock In vs Stock Out movement flow (zero-filled via generate_series)
      this.prisma.raw.$queryRaw<Array<{ bucket: Date; stock_in: number; stock_out: number }>>`
        WITH series AS (
          SELECT generate_series(
            date_trunc(${truncUnit}, ${fromDate}::timestamptz AT TIME ZONE 'UTC'),
            date_trunc(${truncUnit}, ${now}::timestamptz AT TIME ZONE 'UTC'),
            ${stepInterval}::interval
          ) AS bucket
        ),
        mov AS (
          SELECT
            date_trunc(${truncUnit}, sm.created_at AT TIME ZONE 'UTC') AS bucket,
            COALESCE(SUM(CASE WHEN sm.quantity_delta > 0 THEN sm.quantity_delta ELSE 0 END), 0)::int AS stock_in,
            COALESCE(SUM(CASE WHEN sm.quantity_delta < 0 THEN ABS(sm.quantity_delta) ELSE 0 END), 0)::int AS stock_out
          FROM stock_movements sm
          WHERE sm.created_at >= ${fromDate}::timestamptz
            AND sm.created_at <= ${now}::timestamptz
            ${whMoveFilter}
          GROUP BY 1
        )
        SELECT
          s.bucket,
          COALESCE(m.stock_in, 0)::int AS stock_in,
          COALESCE(m.stock_out, 0)::int AS stock_out
        FROM series s
        LEFT JOIN mov m ON m.bucket = s.bucket
        ORDER BY s.bucket ASC
      `,

      // 8. Inventory valuation & low/out-of-stock counters
      this.prisma.raw.$queryRaw<
        Array<{
          valuation: number;
          total_units: number;
          low_stock_count: number;
          out_of_stock_count: number;
        }>
      >`
        SELECT
          COALESCE(SUM(il.quantity_on_hand * p.unit_cost), 0)::float8 AS valuation,
          COALESCE(SUM(il.quantity_on_hand), 0)::int AS total_units,
          COUNT(*) FILTER (
            WHERE (il.quantity_on_hand - il.quantity_reserved) > 0
              AND (il.quantity_on_hand - il.quantity_reserved) <= il.reorder_point
          )::int AS low_stock_count,
          COUNT(*) FILTER (
            WHERE (il.quantity_on_hand - il.quantity_reserved) <= 0
          )::int AS out_of_stock_count
        FROM inventory_levels il
        INNER JOIN products p ON p.id = il.product_id AND p.deleted_at IS NULL
        WHERE 1 = 1 ${whInvFilter}
      `,

      // 9. Urgent low/out-of-stock alerts preview (top 6)
      this.prisma.raw.$queryRaw<
        Array<{
          id: string;
          product_id: string;
          sku: string;
          product_name: string;
          warehouse_code: string;
          available: number;
          reorder_point: number;
        }>
      >`
        SELECT
          il.id,
          il.product_id,
          p.sku,
          p.name AS product_name,
          w.code AS warehouse_code,
          (il.quantity_on_hand - il.quantity_reserved)::int AS available,
          il.reorder_point::int AS reorder_point
        FROM inventory_levels il
        INNER JOIN products p ON p.id = il.product_id AND p.deleted_at IS NULL
        INNER JOIN warehouses w ON w.id = il.warehouse_id
        WHERE (il.quantity_on_hand - il.quantity_reserved) <= il.reorder_point
          ${whInvFilter}
        ORDER BY (il.quantity_on_hand - il.quantity_reserved) ASC, il.updated_at DESC
        LIMIT 6
      `,

      // 10. Recent orders preview (latest 6)
      this.prisma.raw.order.findMany({
        where: query.warehouseId ? { warehouseId: query.warehouseId } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: {
          customer: { select: { name: true } },
          warehouse: { select: { code: true } },
        },
      }),
    ]);

    const currentRevenue = currentTrendRows.reduce((acc, r) => acc + Number(r.revenue), 0);
    const prevRevenue = prevTrendRows.reduce((acc, r) => acc + Number(r.revenue), 0);
    const currentProfit = currentTrendRows.reduce((acc, r) => acc + Number(r.profit), 0);
    const prevProfit = prevTrendRows.reduce((acc, r) => acc + Number(r.profit), 0);

    const totalOrdersAll = orderStatusRows.reduce((acc, r) => acc + Number(r.count), 0);
    const prevOrdersAll = Number(prevOrderTotals[0]?.count ?? 0);
    const deliveredCount = Number(
      orderStatusRows.find((r) => r.status === 'DELIVERED')?.count ?? 0,
    );
    const cancelledCount = Number(
      orderStatusRows.find((r) => r.status === 'CANCELLED')?.count ?? 0,
    );

    const inv = invSummaryRows[0] ?? {
      valuation: 0,
      total_units: 0,
      low_stock_count: 0,
      out_of_stock_count: 0,
    };

    const revenueTrend = currentTrendRows.map((row, idx) => {
      const iso = new Date(row.bucket).toISOString();
      const prevRow = prevTrendRows[idx];
      return {
        bucket: iso,
        label: formatBucketLabel(iso, granularity),
        revenue: Number(Number(row.revenue).toFixed(2)),
        profit: Number(Number(row.profit).toFixed(2)),
        prevRevenue: Number(Number(prevRow?.revenue ?? 0).toFixed(2)),
        prevProfit: Number(Number(prevRow?.profit ?? 0).toFixed(2)),
        orders: Number(row.orders),
      };
    });

    const stockMovementFlow = stockFlowRows.map((row) => {
      const iso = new Date(row.bucket).toISOString();
      return {
        bucket: iso,
        label: formatBucketLabel(iso, granularity),
        stockIn: Number(row.stock_in),
        stockOut: Number(row.stock_out),
      };
    });

    const payload: AnalyticsOverviewDto = {
      meta: {
        range: query.range,
        granularity,
        fromDate: fromDate.toISOString(),
        toDate: now.toISOString(),
        warehouseId: query.warehouseId ?? null,
        cached: false,
        generatedAt: now.toISOString(),
      },
      kpis: {
        totalRevenue: {
          value: Number(currentRevenue.toFixed(2)),
          previousValue: Number(prevRevenue.toFixed(2)),
          deltaPct: calcDeltaPct(currentRevenue, prevRevenue),
          sparkline: revenueTrend.slice(-12).map((p) => p.revenue),
        },
        grossProfit: {
          value: Number(currentProfit.toFixed(2)),
          previousValue: Number(prevProfit.toFixed(2)),
          deltaPct: calcDeltaPct(currentProfit, prevProfit),
          marginPct:
            currentRevenue > 0 ? Number(((currentProfit / currentRevenue) * 100).toFixed(1)) : 0,
          sparkline: revenueTrend.slice(-12).map((p) => p.profit),
        },
        totalOrders: {
          value: totalOrdersAll,
          previousValue: prevOrdersAll,
          deltaPct: calcDeltaPct(totalOrdersAll, prevOrdersAll),
          completionRatePct:
            totalOrdersAll > 0 ? Number(((deliveredCount / totalOrdersAll) * 100).toFixed(1)) : 0,
          cancellationRatePct:
            totalOrdersAll > 0 ? Number(((cancelledCount / totalOrdersAll) * 100).toFixed(1)) : 0,
          sparkline: revenueTrend.slice(-12).map((p) => p.orders),
        },
        inventoryValuation: {
          value: Number(Number(inv.valuation).toFixed(2)),
          totalUnits: Number(inv.total_units),
          lowStockCount: Number(inv.low_stock_count),
          outOfStockCount: Number(inv.out_of_stock_count),
          sparkline: stockMovementFlow.slice(-12).map((p) => Math.max(0, p.stockIn - p.stockOut + 50)),
        },
      },
      revenueTrend,
      ordersByStatus: orderStatusRows.map((r) => ({
        status: r.status,
        count: Number(r.count),
        totalAmount: Number(Number(r.total_amount).toFixed(2)),
      })),
      topProducts: topProductRows.map((p) => ({
        productId: p.product_id,
        sku: p.sku,
        name: p.name,
        revenue: Number(Number(p.revenue).toFixed(2)),
        quantity: Number(p.quantity),
        profit: Number(Number(p.profit).toFixed(2)),
      })),
      warehouseComparison: warehouseRows.map((w) => ({
        warehouseId: w.warehouse_id,
        code: w.code,
        name: w.name,
        salesValue: Number(Number(w.sales_value).toFixed(2)),
        stockValue: Number(Number(w.stock_value).toFixed(2)),
        totalUnits: Number(w.total_units),
        ordersCount: Number(w.orders_count),
      })),
      stockMovementFlow,
      lowStockAlerts: lowStockRows.map((a) => ({
        id: a.id,
        productId: a.product_id,
        sku: a.sku,
        productName: a.product_name,
        warehouseCode: a.warehouse_code,
        available: Number(a.available),
        reorderPoint: Number(a.reorder_point),
        status: Number(a.available) <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      })),
      recentOrders: recentOrdersRows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customer.name,
        warehouseCode: o.warehouse.code,
        totalAmount: Number(o.totalAmount),
        status: o.status as OrderStatus,
        createdAt: o.createdAt.toISOString(),
      })),
    };

    await this.redis.setJson(cacheKey, payload, ANALYTICS_CACHE_TTL_SECONDS);
    return payload;
  }
}
