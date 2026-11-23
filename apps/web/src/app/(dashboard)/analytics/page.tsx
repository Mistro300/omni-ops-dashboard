'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ANALYTICS_GRANULARITIES,
  ANALYTICS_RANGES,
  PERMISSIONS,
  type AnalyticsGranularity,
  type AnalyticsOverviewDto,
  type AnalyticsRange,
  type ExportReportType,
} from '@omni-ops/shared';
import { BarChart3, RefreshCw } from 'lucide-react';
import { RoutePermissionGuard } from '@/components/rbac/permission-gate';
import {
  AnalyticsKpiGrid,
  OrdersStatusDonutChart,
  RevenueTrendChart,
  StockFlowBarChart,
  TopProductsBarChart,
  WarehouseComparisonChart,
} from '@/features/analytics/analytics-charts';
import { ExportJobsPanel } from '@/features/reports/export-jobs-panel';
import { ExportModal } from '@/features/reports/export-modal';
import { apiFetch } from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';
import { getBadgeTokenStyles } from '@/styles/status-badges';

export default function AnalyticsPage() {
  const { locale, activeWarehouseId } = useUi();
  const isAr = locale === 'ar';

  const [range, setRange] = useState<AnalyticsRange>('90d');
  const [granularity, setGranularity] = useState<AnalyticsGranularity | ''>('');
  const [topProductsBy, setTopProductsBy] = useState<'revenue' | 'quantity'>('revenue');
  const [quickExportType, setQuickExportType] = useState<ExportReportType | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['analytics-deep', { range, granularity, activeWarehouseId, topProductsBy }],
    queryFn: () => {
      const sp = new URLSearchParams({ range, topProductsBy });
      if (granularity) sp.set('granularity', granularity);
      if (activeWarehouseId !== 'ALL') sp.set('warehouseId', activeWarehouseId);
      return apiFetch<AnalyticsOverviewDto>(`/analytics/overview?${sp.toString()}`);
    },
  });

  return (
    <RoutePermissionGuard permission={PERMISSIONS.ANALYTICS_READ}>
      <div className="space-y-5 text-start">
        {/* Header & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold text-ink-primary">
                {isAr ? 'التحليلات المتقدمة (Analytics Center)' : 'Advanced Analytics Center'}
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
                  {data.meta.cached ? 'Redis Cache HIT' : 'Live SQL'}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-ink-secondary">
              {isAr
                ? 'جميع الرسوم البيانية الخمسة مع مقارنة الفترات وتبديل الإيراد/الكمية وتكامل Redis Caching.'
                : 'All 5 interactive analytics charts with period comparison, metric toggles & Redis caching.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
              aria-label="Analytics granularity"
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
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-card bg-subtle" />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="h-80 animate-pulse rounded-card bg-subtle" />
              <div className="h-80 animate-pulse rounded-card bg-subtle" />
            </div>
          </div>
        ) : error || !data ? (
          <div className="rounded-card border border-border bg-surface p-8 text-center">
            <p className="text-sm font-semibold text-ink-primary">
              {isAr ? 'فشل تحميل التحليلات' : 'Unable to load analytics'}
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

            {/* 4 KPI Cards */}
            <AnalyticsKpiGrid data={data} />

            {/* Chart 1 (Revenue Trend) + Chart 2 (Orders Donut) */}
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <RevenueTrendChart data={data.revenueTrend} />
              </div>
              <OrdersStatusDonutChart data={data.ordersByStatus} />
            </div>

            {/* Chart 3 (Top 10 Products) + Chart 4 (Warehouse Comparison) */}
            <div className="grid gap-5 lg:grid-cols-2">
              <TopProductsBarChart
                data={data.topProducts}
                metric={topProductsBy}
                onMetricChange={setTopProductsBy}
              />
              <WarehouseComparisonChart data={data.warehouseComparison} />
            </div>

            {/* Chart 5 (Stock In vs Stock Out Dual Bar) */}
            <StockFlowBarChart data={data.stockMovementFlow} />
          </>
        )}

        {/* Phase 5: Export Jobs Center (BullMQ + MinIO) */}
        <ExportJobsPanel onQuickExport={(type) => setQuickExportType(type)} />

        {quickExportType && (
          <ExportModal
            open={true}
            onClose={() => setQuickExportType(null)}
            reportType={quickExportType}
            filters={{
              warehouseId: activeWarehouseId !== 'ALL' ? activeWarehouseId : undefined,
            }}
          />
        )}
      </div>
    </RoutePermissionGuard>
  );
}
