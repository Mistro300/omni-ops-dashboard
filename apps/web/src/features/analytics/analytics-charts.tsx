'use client';

import { useState } from 'react';
import type {
  AnalyticsOverviewDto,
  OrderStatus,
} from '@omni-ops/shared';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, DollarSign, Package, ShoppingCart, TrendingUp } from 'lucide-react';
import { useUi } from '@/providers/app-providers';
import { getBadgeTokenStyles } from '@/styles/status-badges';

const CHART_COLORS = {
  indigo: '#4F46E5',
  emerald: '#10B981',
  cyan: '#06B6D4',
  amber: '#F59E0B',
  rose: '#F43F5E',
  purple: '#9333EA',
  zinc: '#71717A',
} as const;

const ORDER_STATUS_CHART_COLOR: Record<OrderStatus, string> = {
  DELIVERED: CHART_COLORS.emerald,
  SHIPPED: CHART_COLORS.cyan,
  CONFIRMED: CHART_COLORS.indigo,
  PENDING: CHART_COLORS.amber,
  CANCELLED: CHART_COLORS.rose,
  REFUNDED: CHART_COLORS.purple,
};

function formatCompactCurrency(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    dataKey?: string;
  }>;
  currency?: boolean;
}

function PrecisionTooltip({ active, label, payload, currency = false }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      className="rounded-card border px-3 py-2 text-start text-xs"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        color: 'var(--color-text-primary)',
      }}
    >
      {label && (
        <div className="mb-1.5 border-b border-border pb-1 font-semibold text-ink-primary">
          {label}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-secondary">
              <span
                className="h-2 w-2 rounded-pill"
                style={{ backgroundColor: entry.color ?? CHART_COLORS.indigo }}
              />
              <span>{entry.name}</span>
            </span>
            <span dir="ltr" className="mono-tabular font-semibold text-ink-primary">
              {currency
                ? `$${Number(entry.value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : Number(entry.value ?? 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
 * 1. Four Enterprise KPI Cards with Mini Sparklines
 * ========================================================================== */
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const series = (data.length > 1 ? data : [0, ...data]).map((v, i) => ({ i, v }));
  return (
    <div className="h-10 w-24 shrink-0" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={color}
            fillOpacity={0.14}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AnalyticsKpiGrid({ data }: { data: AnalyticsOverviewDto }) {
  const { locale } = useUi();
  const isAr = locale === 'ar';
  const { totalRevenue, grossProfit, totalOrders, inventoryValuation } = data.kpis;

  const cards = [
    {
      key: 'revenue',
      title: isAr ? 'إجمالي الإيرادات' : 'Total Revenue',
      value: formatCompactCurrency(totalRevenue.value),
      fullValue: `$${totalRevenue.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      delta: totalRevenue.deltaPct,
      sub: isAr
        ? `الفترة السابقة: ${formatCompactCurrency(totalRevenue.previousValue)}`
        : `Prev period: ${formatCompactCurrency(totalRevenue.previousValue)}`,
      sparkline: totalRevenue.sparkline,
      color: CHART_COLORS.indigo,
      icon: DollarSign,
    },
    {
      key: 'profit',
      title: isAr ? 'صافي الربح التقديري' : 'Estimated Gross Profit',
      value: formatCompactCurrency(grossProfit.value),
      fullValue: `$${grossProfit.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      delta: grossProfit.deltaPct,
      sub: isAr
        ? `هامش الربح: ${grossProfit.marginPct}%`
        : `Gross margin: ${grossProfit.marginPct}%`,
      sparkline: grossProfit.sparkline,
      color: CHART_COLORS.emerald,
      icon: TrendingUp,
    },
    {
      key: 'orders',
      title: isAr ? 'إجمالي الطلبات' : 'Total Orders',
      value: totalOrders.value.toLocaleString(),
      fullValue: `${totalOrders.value.toLocaleString()} orders`,
      delta: totalOrders.deltaPct,
      sub: isAr
        ? `مكتمل ${totalOrders.completionRatePct}% • ملغى ${totalOrders.cancellationRatePct}%`
        : `Delivered ${totalOrders.completionRatePct}% • Cancelled ${totalOrders.cancellationRatePct}%`,
      sparkline: totalOrders.sparkline,
      color: CHART_COLORS.cyan,
      icon: ShoppingCart,
    },
    {
      key: 'inventory',
      title: isAr ? 'قيمة المخزون الحالي' : 'Inventory Valuation',
      value: formatCompactCurrency(inventoryValuation.value),
      fullValue: `$${inventoryValuation.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      delta: null as number | null,
      sub: isAr
        ? `منخفض: ${inventoryValuation.lowStockCount} • نافد: ${inventoryValuation.outOfStockCount}`
        : `Low stock: ${inventoryValuation.lowStockCount} • Out: ${inventoryValuation.outOfStockCount}`,
      sparkline: inventoryValuation.sparkline,
      color: CHART_COLORS.amber,
      icon: Package,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const positive = card.delta !== null && card.delta >= 0;
        const deltaStyles = getBadgeTokenStyles(
          card.delta === null
            ? inventoryValuation.outOfStockCount > 0
              ? 'rose'
              : 'amber'
            : positive
              ? 'emerald'
              : 'rose',
        );

        return (
          <div
            key={card.key}
            title={card.fullValue}
            className="flex flex-col justify-between rounded-card border border-border bg-surface p-4 text-start"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-secondary">{card.title}</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-control border border-border bg-canvas text-ink-secondary">
                <Icon className="h-3.5 w-3.5" />
              </span>
            </div>

            <div className="mt-3 flex items-end justify-between gap-2">
              <div>
                <div dir="ltr" className="mono-tabular text-2xl font-bold text-ink-primary">
                  {card.value}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {card.delta !== null ? (
                    <span className="status-pill" style={deltaStyles.pill}>
                      {positive ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      <span dir="ltr" className="mono-tabular">
                        {positive ? `+${card.delta}%` : `${card.delta}%`}
                      </span>
                    </span>
                  ) : (
                    <span className="status-pill" style={deltaStyles.pill}>
                      <span className="status-dot" style={deltaStyles.dot} />
                      <span dir="ltr" className="mono-tabular">
                        {inventoryValuation.totalUnits.toLocaleString()} {isAr ? 'وحدة' : 'units'}
                      </span>
                    </span>
                  )}
                </div>
              </div>
              <MiniSparkline data={card.sparkline} color={card.color} />
            </div>

            <div className="mt-3 border-t border-border pt-2 text-[11px] text-ink-secondary">
              {card.sub}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================================
 * 2. Chart 1: Revenue & Profit Trend (with Compare Previous Period Toggle)
 * ========================================================================== */
export function RevenueTrendChart({ data }: { data: AnalyticsOverviewDto['revenueTrend'] }) {
  const { locale } = useUi();
  const isAr = locale === 'ar';
  const [comparePrev, setComparePrev] = useState(false);

  return (
    <section className="rounded-card border border-border bg-surface p-4 text-start">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-ink-primary">
            {isAr ? 'تطور الإيرادات والأرباح عبر الزمن' : 'Revenue & Gross Profit Trend'}
          </h2>
          <span className="mono-tabular rounded-pill border border-border bg-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-secondary">
            65%
          </span>
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-control border border-border bg-canvas px-2.5 py-1 text-xs text-ink-primary">
          <input
            type="checkbox"
            checked={comparePrev}
            onChange={(e) => setComparePrev(e.target.checked)}
            className="h-3.5 w-3.5 rounded accent-primary"
          />
          <span>{isAr ? 'مقارنة بالفترة السابقة' : 'Compare previous period'}</span>
        </label>
      </div>

      <div className="h-[280px] w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="omniRevFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.indigo} stopOpacity={0.22} />
                <stop offset="95%" stopColor={CHART_COLORS.indigo} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="omniProfitFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS.emerald} stopOpacity={0.2} />
                <stop offset="95%" stopColor={CHART_COLORS.emerald} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
            />
            <YAxis
              tickFormatter={formatCompactCurrency}
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={62}
            />
            <Tooltip content={<PrecisionTooltip currency />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="revenue"
              name={isAr ? 'الإيرادات' : 'Revenue'}
              stroke={CHART_COLORS.indigo}
              strokeWidth={2}
              fill="url(#omniRevFill)"
            />
            <Area
              type="monotone"
              dataKey="profit"
              name={isAr ? 'صافي الربح' : 'Gross Profit'}
              stroke={CHART_COLORS.emerald}
              strokeWidth={2}
              fill="url(#omniProfitFill)"
            />
            {comparePrev && (
              <Line
                type="monotone"
                dataKey="prevRevenue"
                name={isAr ? 'إيراد الفترة السابقة' : 'Prev Revenue'}
                stroke={CHART_COLORS.amber}
                strokeWidth={1.75}
                strokeDasharray="5 4"
                dot={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/* ============================================================================
 * 3. Chart 2: Orders by Status Donut Chart
 * ========================================================================== */
export function OrdersStatusDonutChart({
  data,
}: {
  data: AnalyticsOverviewDto['ordersByStatus'];
}) {
  const { locale } = useUi();
  const isAr = locale === 'ar';
  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <section className="flex flex-col justify-between rounded-card border border-border bg-surface p-4 text-start">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink-primary">
          {isAr ? 'توزيع الطلبات حسب الحالة' : 'Orders by Status'}
        </h2>
        <span className="mono-tabular rounded-pill border border-border bg-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-secondary">
          35%
        </span>
      </div>

      <div className="grid items-center gap-4 sm:grid-cols-2">
        {/* Donut with centered Total Count matching Mockup 8 */}
        <div className="relative h-[200px] w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="status"
                cx="50%"
                cy="50%"
                innerRadius={56}
                outerRadius={82}
                paddingAngle={2}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.status}
                    fill={ORDER_STATUS_CHART_COLOR[entry.status] ?? CHART_COLORS.zinc}
                  />
                ))}
              </Pie>
              <Tooltip content={<PrecisionTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="mono-tabular text-xl font-bold text-ink-primary">
              {total.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Side Percentage Legend matching Mockup 8 */}
        <div className="space-y-2 text-xs" dir="ltr">
          {data.map((item) => {
            const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0.0';
            return (
              <div
                key={item.status}
                className="flex items-center justify-between gap-2 py-0.5"
              >
                <span className="flex items-center gap-2 font-semibold text-ink-primary">
                  <span
                    className="h-3.5 w-1.5 rounded-pill"
                    style={{ backgroundColor: ORDER_STATUS_CHART_COLOR[item.status] }}
                  />
                  <span className="mono-tabular text-[11px]">{item.status}</span>
                </span>
                <span className="mono-tabular text-xs font-semibold text-ink-secondary">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ============================================================================
 * 4. Chart 3: Top 10 Products Horizontal Bar (Revenue vs Quantity Toggle)
 * ========================================================================== */
export function TopProductsBarChart({
  data,
  metric,
  onMetricChange,
}: {
  data: AnalyticsOverviewDto['topProducts'];
  metric: 'revenue' | 'quantity';
  onMetricChange: (m: 'revenue' | 'quantity') => void;
}) {
  const { locale } = useUi();
  const isAr = locale === 'ar';

  return (
    <section className="rounded-card border border-border bg-surface p-4 text-start">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink-primary">
            {isAr ? 'أعلى 10 منتجات مبيعاً' : 'Top 10 Selling Products'}
          </h2>
          <p className="text-[11px] text-ink-secondary">
            {metric === 'revenue'
              ? isAr
                ? 'مرتبة حسب إجمالي الإيراد ($)'
                : 'Ranked by total revenue ($)'
              : isAr
                ? 'مرتبة حسب عدد الوحدات المباعة'
                : 'Ranked by total units sold'}
          </p>
        </div>

        <div className="inline-flex rounded-control border border-border bg-canvas p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onMetricChange('revenue')}
            className={`rounded-control px-2.5 py-1 font-medium ${
              metric === 'revenue' ? 'bg-primary text-primary-foreground' : 'text-ink-secondary'
            }`}
          >
            {isAr ? 'الإيراد ($)' : 'Revenue'}
          </button>
          <button
            type="button"
            onClick={() => onMetricChange('quantity')}
            className={`rounded-control px-2.5 py-1 font-medium ${
              metric === 'quantity' ? 'bg-primary text-primary-foreground' : 'text-ink-secondary'
            }`}
          >
            {isAr ? 'الكمية' : 'Quantity'}
          </button>
        </div>
      </div>

      <div className="h-[310px] w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={metric === 'revenue' ? formatCompactCurrency : undefined}
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="sku"
              tick={{ fill: 'var(--color-text-primary)', fontSize: 11 }}
              width={78}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<PrecisionTooltip currency={metric === 'revenue'} />} />
            <Bar
              dataKey={metric}
              name={metric === 'revenue' ? (isAr ? 'الإيراد' : 'Revenue') : isAr ? 'الكمية' : 'Units'}
              fill={metric === 'revenue' ? CHART_COLORS.indigo : CHART_COLORS.cyan}
              radius={[0, 4, 4, 0]}
              barSize={18}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/* ============================================================================
 * 5. Chart 4: Warehouse Comparison Grouped Bar (Sales vs Stock Valuation)
 * ========================================================================== */
export function WarehouseComparisonChart({
  data,
}: {
  data: AnalyticsOverviewDto['warehouseComparison'];
}) {
  const { locale } = useUi();
  const isAr = locale === 'ar';

  return (
    <section className="rounded-card border border-border bg-surface p-4 text-start">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink-primary">
          {isAr ? 'مقارنة المبيعات وقيمة المخزون بين المستودعات' : 'Warehouse Sales vs. Stock Valuation'}
        </h2>
        <p className="text-[11px] text-ink-secondary">
          {isAr
            ? 'مقارنة مبيعات الفترة مقابل القيمة التكلفية للمخزون الحالي في كل مستودع'
            : 'Period sales value vs. current on-hand inventory valuation per hub'}
        </p>
      </div>

      <div className="h-[310px] w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="code"
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
            />
            <YAxis
              tickFormatter={formatCompactCurrency}
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip content={<PrecisionTooltip currency />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="salesValue"
              name={isAr ? 'مبيعات الفترة' : 'Period Sales'}
              fill={CHART_COLORS.indigo}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="stockValue"
              name={isAr ? 'قيمة المخزون' : 'Stock Valuation'}
              fill={CHART_COLORS.cyan}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/* ============================================================================
 * 6. Chart 5: Stock In vs. Stock Out Dual Bar Chart
 * ========================================================================== */
export function StockFlowBarChart({
  data,
}: {
  data: AnalyticsOverviewDto['stockMovementFlow'];
}) {
  const { locale } = useUi();
  const isAr = locale === 'ar';

  return (
    <section className="rounded-card border border-border bg-surface p-4 text-start">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink-primary">
          {isAr ? 'حجم الحركات المخزنية (الداخل مقابل الخارج)' : 'Stock Movement Flow (In vs. Out)'}
        </h2>
        <p className="text-[11px] text-ink-secondary">
          {isAr
            ? 'إجمالي الوحدات الداخلة (IN/TRANSFER_IN) مقابل الخارجة (OUT/TRANSFER_OUT)'
            : 'Total incoming units vs. outgoing dispatched units over selected range'}
        </p>
      </div>

      <div className="h-[280px] w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
            />
            <YAxis
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip content={<PrecisionTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="stockIn"
              name={isAr ? 'داخل (Stock In)' : 'Stock In'}
              fill={CHART_COLORS.emerald}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="stockOut"
              name={isAr ? 'خارج (Stock Out)' : 'Stock Out'}
              fill={CHART_COLORS.rose}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
