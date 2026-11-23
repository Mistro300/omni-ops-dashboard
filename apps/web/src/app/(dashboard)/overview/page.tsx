'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ANALYTICS_GRANULARITIES,
  ANALYTICS_RANGES,
  type AnalyticsGranularity,
  type AnalyticsOverviewDto,
  type AnalyticsRange,
} from '@omni-ops/shared';
import { AlertTriangle, ArrowUpRight, BarChart3, Clock, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import {
  AnalyticsKpiGrid,
  OrdersStatusDonutChart,
  RevenueTrendChart,
} from '@/features/analytics/analytics-charts';
import { apiFetch } from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';
import {
  getBadgeTokenStyles,
  INVENTORY_STATUS_TONE,
  ORDER_STATUS_TONE,
} from '@/styles/status-badges';

export default function OverviewPage() {
  const { locale, activeWarehouseId } = useUi();
  const isAr = locale === 'ar';

  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [granularity, setGranularity] = useState<AnalyticsGranularity | ''>('');

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['analytics-overview', { range, granularity, activeWarehouseId, topProductsBy: 'revenue' }],
    queryFn: () => {
      const sp = new URLSearchParams({ range, topProductsBy: 'revenue' });
      if (granularity) sp.set('granularity', granularity);
      if (activeWarehouseId !== 'ALL') sp.set('warehouseId', activeWarehouseId);
      return apiFetch<AnalyticsOverviewDto>(`/analytics/overview?${sp.toString()}`);
    },
  });

  return (
    <div className="space-y-5 text-start">
      {/* Executive Overview Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-ink-primary">
              {isAr ? 'لوحة المؤشرات الرئيسية (Executive Overview)' : 'Executive Overview'}
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
          <p className="mt-0.5 text-xs text-ink-secondary">
            {isAr
              ? 'ملخص فوري للإيرادات، الأرباح، الطلبات، وتنبيهات المخزون الحرجة.'
              : 'Real-time operational KPIs, revenue trends, and urgent stock alerts.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date Range Pills */}
          <div className="inline-flex rounded-control border border-border bg-surface p-0.5 text-xs">
            {ANALYTICS_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRange(r);
                  setGranularity('');
                }}
                className={`mono-tabular rounded-control px-2.5 py-1 font-medium ${
                  range === r ? 'bg-primary text-primary-foreground' : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Granularity Selector */}
          <select
            aria-label="Chart granularity"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as AnalyticsGranularity | '')}
            className="h-8 rounded-control border border-border bg-surface px-2.5 text-xs text-ink-primary outline-none"
          >
            <option value="">{isAr ? 'تجميع تلقائي' : 'Auto bucket'}</option>
            {ANALYTICS_GRANULARITIES.map((g) => (
              <option key={g} value={g}>
                {g === 'day' ? (isAr ? 'يومي' : 'Daily') : g === 'week' ? (isAr ? 'أسبوعي' : 'Weekly') : isAr ? 'شهري' : 'Monthly'}
              </option>
            ))}
          </select>

          <Link
            href="/analytics"
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-xs font-medium text-primary hover:bg-subtle"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            {isAr ? 'التحليلات الكاملة' : 'Deep Analytics'}
          </Link>
        </div>
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

          {/* Main Charts Row */}
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RevenueTrendChart data={data.revenueTrend} />
            </div>
            <OrdersStatusDonutChart data={data.ordersByStatus} />
          </div>

          {/* Operational Actionable Widgets Row: Low Stock Alerts + Recent Orders */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Low Stock Alerts Widget */}
            <section className="rounded-card border border-border bg-surface p-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" style={{ color: 'var(--status-amber-dot)' }} />
                  <h2 className="text-sm font-semibold text-ink-primary">
                    {isAr ? 'تنبيهات نقص المخزون العاجلة' : 'Urgent Low-Stock Alerts'}
                  </h2>
                </div>
                <Link
                  href="/inventory?stockHealth=LOW_STOCK"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {isAr ? 'عرض الكل' : 'View all'}
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="mt-3 space-y-2">
                {data.lowStockAlerts.length === 0 ? (
                  <div className="py-6 text-center text-xs text-ink-secondary">
                    {isAr ? 'جميع المنتجات فوق حد إعادة الطلب' : 'All products above reorder threshold'}
                  </div>
                ) : (
                  data.lowStockAlerts.map((alert) => {
                    const st = getBadgeTokenStyles(INVENTORY_STATUS_TONE[alert.status]);
                    return (
                      <Link
                        key={alert.id}
                        href={`/products/${alert.productId}`}
                        className="flex items-center justify-between gap-3 rounded-control border border-border bg-canvas px-3 py-2 transition-colors hover:bg-subtle"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span dir="ltr" className="mono-tabular text-xs font-semibold text-primary">
                              {alert.sku}
                            </span>
                            <span dir="ltr" className="mono-tabular text-[11px] text-ink-secondary">
                              {alert.warehouseCode}
                            </span>
                          </div>
                          <div className="truncate text-xs text-ink-primary">{alert.productName}</div>
                        </div>
                        <div className="shrink-0 text-end">
                          <span className="status-pill" style={st.pill}>
                            <span className="status-dot" style={st.dot} />
                            <span dir="ltr" className="mono-tabular">
                              {alert.available} / {alert.reorderPoint}
                            </span>
                          </span>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </section>

            {/* Recent Orders Widget */}
            <section className="rounded-card border border-border bg-surface p-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-ink-primary">
                    {isAr ? 'أحدث الطلبات' : 'Latest Orders'}
                  </h2>
                </div>
                <Link
                  href="/orders"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {isAr ? 'عرض الكل' : 'View all'}
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="mt-3 space-y-2">
                {data.recentOrders.map((ord) => {
                  const st = getBadgeTokenStyles(ORDER_STATUS_TONE[ord.status]);
                  return (
                    <Link
                      key={ord.id}
                      href={`/orders/${ord.id}`}
                      className="flex items-center justify-between gap-3 rounded-control border border-border bg-canvas px-3 py-2 transition-colors hover:bg-subtle"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span dir="ltr" className="mono-tabular text-xs font-semibold text-primary">
                            {ord.orderNumber}
                          </span>
                          <span dir="ltr" className="mono-tabular text-[11px] text-ink-secondary">
                            {ord.warehouseCode}
                          </span>
                        </div>
                        <div className="truncate text-xs text-ink-secondary">{ord.customerName}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="mono-tabular text-xs font-semibold text-ink-primary">
                          ${ord.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <span className="status-pill" style={st.pill}>
                          <span className="status-dot" style={st.dot} />
                          {ord.status}
                        </span>
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
