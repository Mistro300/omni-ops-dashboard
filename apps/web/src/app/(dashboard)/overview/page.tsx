'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ANALYTICS_RANGES,
  type AnalyticsOverviewDto,
  type AnalyticsRange,
  type WarehouseDto,
} from '@omni-ops/shared';
import { MoreHorizontal, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import {
  AnalyticsKpiGrid,
  OrdersStatusDonutChart,
  RevenueTrendChart,
} from '@/features/analytics/analytics-charts';
import { apiFetch } from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';
import { getBadgeTokenStyles } from '@/styles/status-badges';

export default function OverviewPage() {
  const { locale, activeWarehouseId, setActiveWarehouseId } = useUi();
  const isAr = locale === 'ar';

  const [range, setRange] = useState<AnalyticsRange>('30d');

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiFetch<WarehouseDto[]>('/warehouses'),
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['analytics-overview', { range, activeWarehouseId, topProductsBy: 'revenue' }],
    queryFn: () => {
      const sp = new URLSearchParams({ range, topProductsBy: 'revenue' });
      if (activeWarehouseId !== 'ALL') sp.set('warehouseId', activeWarehouseId);
      return apiFetch<AnalyticsOverviewDto>(`/analytics/overview?${sp.toString()}`);
    },
  });

  return (
    <div className="space-y-4 text-start">
      {/* Header matching Mockup 8 */}
      <div>
        <div className="text-[11px] text-ink-secondary">
          {isAr ? 'الرئيسية / لوحة المؤشرات' : 'Home / Executive Overview'}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-ink-primary">
            {isAr ? 'لوحة المؤشرات الرئيسية' : 'Executive Overview'}
          </h1>
          {data?.meta && (
            <span
              className="status-pill"
              style={getBadgeTokenStyles(data.meta.cached ? 'emerald' : 'indigo').pill}
            >
              <span
                className="status-dot"
                style={getBadgeTokenStyles(data.meta.cached ? 'emerald' : 'indigo').dot}
              />
              {data.meta.cached ? 'Redis Cache HIT' : 'Live SQL Aggregation'}
            </span>
          )}
        </div>
      </div>

      {/* Sub-toolbar: Segmented Range Pills + Warehouse Selector matching Mockup 8 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-control border border-border bg-surface p-0.5 text-xs">
          {ANALYTICS_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`mono-tabular rounded-control px-3 py-1.5 font-semibold transition-colors ${
                range === r
                  ? 'bg-primary text-primary-foreground'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <select
          aria-label="Filter by warehouse"
          value={activeWarehouseId}
          onChange={(e) => setActiveWarehouseId(e.target.value)}
          className="h-9 rounded-control border border-border bg-surface px-3 text-xs font-medium text-ink-primary outline-none"
        >
          <option value="ALL">{isAr ? 'جميع المستودعات' : 'All Warehouses'}</option>
          {warehouses.map((wh) => (
            <option key={wh.id} value={wh.id}>
              {wh.code} — {wh.name}
            </option>
          ))}
        </select>
      </div>

      {/* Loading / Error / Data */}
      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-card border border-border bg-surface" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="h-80 animate-pulse rounded-card border border-border bg-surface lg:col-span-2" />
            <div className="h-80 animate-pulse rounded-card border border-border bg-surface" />
          </div>
        </div>
      ) : error || !data ? (
        <div className="rounded-card border border-border bg-surface p-8 text-center">
          <p className="text-sm font-semibold text-ink-primary">
            {isAr ? 'تعذّر تحميل بيانات التحليلات' : 'Failed to load analytics'}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-control border border-border bg-canvas px-3 py-1.5 text-xs font-medium text-ink-primary"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {isAr ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      ) : (
        <>
          {isFetching && <div className="h-0.5 w-full animate-pulse rounded bg-primary" />}

          {/* 4 KPI Cards with Mini Sparklines */}
          <AnalyticsKpiGrid data={data} />

          {/* Main Charts Row: Revenue Trend (Right) + Orders Donut (Left) matching Mockup 8 */}
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <RevenueTrendChart data={data.revenueTrend} />
            </div>
            <div className="lg:col-span-5">
              <OrdersStatusDonutChart data={data.ordersByStatus} />
            </div>
          </div>

          {/* Bottom Row: Urgent Low-Stock Alerts + Latest Orders matching Mockup 8 */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Low Stock Alerts Widget */}
            <section className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-bold text-ink-primary">
                  {isAr ? 'تنبيهات نقص المخزون العاجلة' : 'Urgent Low-Stock Alerts'}
                </h2>
              </div>
              <div className="border-b border-border bg-subtle px-4 py-2 text-[11px] font-semibold text-ink-secondary">
                SKU
              </div>
              <div className="divide-y divide-border">
                {data.lowStockAlerts.map((alert) => {
                  const isOut = alert.status === 'OUT_OF_STOCK' || alert.available === 0;
                  return (
                    <Link
                      key={alert.id}
                      href={`/products/${alert.productId}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-subtle/60"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          dir="ltr"
                          className="mono-tabular inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-bold text-white"
                          style={{
                            backgroundColor: isOut ? '#DC2626' : '#D97706',
                          }}
                        >
                          {alert.available}/{alert.reorderPoint}
                        </span>
                        <span dir="ltr" className="mono-tabular font-semibold text-ink-primary">
                          | {alert.warehouseCode} | {alert.sku}
                        </span>
                      </div>
                      <MoreHorizontal className="h-4 w-4 text-ink-secondary" />
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* Latest Orders Widget */}
            <section className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-bold text-ink-primary">
                  {isAr ? 'أحدث الطلبات' : 'Latest Orders'}
                </h2>
              </div>
              <div className="grid grid-cols-3 border-b border-border bg-subtle px-4 py-2 text-[11px] font-semibold text-ink-secondary">
                <span>{isAr ? 'الطلبات' : 'Order'}</span>
                <span className="text-center">{isAr ? 'التنفيذ' : 'Status'}</span>
                <span className="text-end" />
              </div>
              <div className="divide-y divide-border">
                {data.recentOrders.map((ord) => {
                  const isDone = ord.status === 'DELIVERED';
                  return (
                    <Link
                      key={ord.id}
                      href={`/orders/${ord.id}`}
                      className="grid grid-cols-3 items-center px-4 py-2.5 text-xs transition-colors hover:bg-subtle/60"
                    >
                      <span dir="ltr" className="mono-tabular font-semibold text-ink-primary">
                        {ord.orderNumber}
                      </span>
                      <div className="flex items-center justify-center gap-1.5">
                        {isDone ? (
                          <>
                            <span
                              className="inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-bold text-white"
                              style={{ backgroundColor: '#10B981' }}
                            >
                              {isAr ? 'مكتمل' : 'Delivered'}
                            </span>
                            <span className="rounded-pill bg-subtle px-2 py-0.5 text-[11px] text-ink-secondary">
                              {isAr ? 'قيد التنفيذ' : 'Fulfilled'}
                            </span>
                          </>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-pill px-3 py-0.5 text-[11px] font-bold text-white"
                            style={{ backgroundColor: '#3730A3' }}
                          >
                            {isAr ? 'قيد التنفيذ' : 'In Progress'}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-end">
                        <MoreHorizontal className="h-4 w-4 text-ink-secondary" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
