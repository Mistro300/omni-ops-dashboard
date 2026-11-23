'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ANALYTICS_RANGES,
  PERMISSIONS,
  type AnalyticsOverviewDto,
  type AnalyticsRange,
  type ExportReportType,
} from '@omni-ops/shared';
import { Plus, RefreshCw } from 'lucide-react';
import { RoutePermissionGuard } from '@/components/rbac/permission-gate';
import {
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

  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [topProductsBy, setTopProductsBy] = useState<'revenue' | 'quantity'>('revenue');
  const [quickExportType, setQuickExportType] = useState<ExportReportType | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['analytics-deep', { range, activeWarehouseId, topProductsBy }],
    queryFn: () => {
      const sp = new URLSearchParams({ range, topProductsBy });
      if (activeWarehouseId !== 'ALL') sp.set('warehouseId', activeWarehouseId);
      return apiFetch<AnalyticsOverviewDto>(`/analytics/overview?${sp.toString()}`);
    },
  });

  return (
    <RoutePermissionGuard permission={PERMISSIONS.ANALYTICS_READ}>
      <div className="space-y-4 text-start">
        {/* Top Title + Redis Cache HIT Badge matching Mockup 3 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] text-ink-secondary">
              {isAr ? 'الرئيسية / التقارير / التحليلات والتصدير' : 'Home / Reports / Analytics & Exports'}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold text-ink-primary">
                {isAr ? 'التحليلات المتقدمة' : 'Advanced Analytics'}
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
          </div>
        </div>

        {/* Sub-Toolbar: Range Segmented Pills (Right) + "+ تصدير تقرير جديد" (Left) matching Mockup 3 */}
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

          <button
            type="button"
            onClick={() => setQuickExportType('orders')}
            className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            {isAr ? 'تصدير تقرير جديد' : 'New Report Export'}
          </button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-card bg-subtle" />
            ))}
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

            {/* 2x2 Grid Layout matching Mockup 3:
                Row 1: Top 10 Products (Right in RTL) + Warehouse Sales vs Stock (Left in RTL)
                Row 2: Stock Movement Flow (Right in RTL) + Export Jobs Center (Left in RTL) */}
            <div className="grid gap-5 lg:grid-cols-2">
              <TopProductsBarChart
                data={data.topProducts}
                metric={topProductsBy}
                onMetricChange={setTopProductsBy}
              />
              <WarehouseComparisonChart data={data.warehouseComparison} />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <StockFlowBarChart data={data.stockMovementFlow} />
              <ExportJobsPanel onQuickExport={(type) => setQuickExportType(type)} />
            </div>
          </>
        )}

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
