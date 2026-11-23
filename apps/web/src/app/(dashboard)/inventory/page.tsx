'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  PERMISSIONS,
  STOCK_MOVEMENT_TYPES,
  type CursorPaginatedResponse,
  type InventoryLevelDto,
  type OffsetPaginatedResponse,
  type StockHealthFilter,
  type StockMovementDto,
  type StockMovementType,
  type WarehouseDto,
} from '@omni-ops/shared';
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  Download,
  History,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { DataTable, type ActiveFilterChip } from '@/components/data-table/data-table';
import { PermissionGate, RoutePermissionGuard } from '@/components/rbac/permission-gate';
import {
  StockAdjustmentModal,
  StockTransferModal,
  WarehouseModal,
} from '@/features/inventory/inventory-modals';
import { ExportModal } from '@/features/reports/export-modal';
import { useDebounce } from '@/hooks/use-debounce';
import { useUrlTableState } from '@/hooks/use-url-table-state';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useUi } from '@/providers/app-providers';
import {
  getBadgeTokenStyles,
  INVENTORY_STATUS_TONE,
  MOVEMENT_TYPE_TONE,
} from '@/styles/status-badges';

type InventoryTab = 'levels' | 'warehouses' | 'ledger';

function InventoryWorkspaceContent() {
  const { locale, activeWarehouseId } = useUi();
  const isAr = locale === 'ar';

  const { getParam, getNumberParam, setParams, clearParams } = useUrlTableState();
  const activeTab = (getParam('tab', 'levels') as InventoryTab) || 'levels';

  // Levels Tab URL state
  const page = getNumberParam('page', 1);
  const limit = getNumberParam('limit', 20);
  const sortBy = getParam('sortBy', 'updatedAt');
  const sortDir = (getParam('sortDir', 'desc') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const urlQ = getParam('q', '');
  const urlWarehouseId = getParam('warehouseId', '');
  const stockHealth = getParam('stockHealth', '') as StockHealthFilter | '';
  const movementType = getParam('type', '') as StockMovementType | '';

  const effectiveWarehouseId =
    urlWarehouseId || (activeWarehouseId !== 'ALL' ? activeWarehouseId : '');

  const [searchInput, setSearchInput] = useState(urlQ);
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    if (debouncedSearch !== urlQ) {
      setParams({ q: debouncedSearch });
    }
  }, [debouncedSearch, urlQ, setParams]);

  // Modals state
  const [adjustTarget, setAdjustTarget] = useState<InventoryLevelDto | null>(null);
  const [transferTarget, setTransferTarget] = useState<InventoryLevelDto | null>(null);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseDto | null>(null);
  const [exportReportType, setExportReportType] = useState<'inventory' | 'stock_movements' | null>(
    null,
  );

  const { data: warehouses = [], isLoading: warehousesLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiFetch<WarehouseDto[]>('/warehouses'),
  });

  // Tab 1: Stock Levels (Offset Pagination)
  const levelsQuery = useQuery({
    queryKey: [
      'inventory-levels',
      { page, limit, sortBy, sortDir, q: urlQ, warehouseId: effectiveWarehouseId, stockHealth },
    ],
    enabled: activeTab === 'levels',
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set('page', String(page));
      sp.set('limit', String(limit));
      sp.set('sortBy', sortBy);
      sp.set('sortDir', sortDir);
      if (urlQ) sp.set('q', urlQ);
      if (effectiveWarehouseId) sp.set('warehouseId', effectiveWarehouseId);
      if (stockHealth) sp.set('stockHealth', stockHealth);
      return apiFetch<OffsetPaginatedResponse<InventoryLevelDto>>(`/inventory?${sp.toString()}`);
    },
  });

  // Tab 3: Stock Movements Ledger (Cursor-Based Pagination)
  const ledgerQuery = useInfiniteQuery({
    queryKey: [
      'stock-movements',
      { q: urlQ, warehouseId: effectiveWarehouseId, type: movementType },
    ],
    enabled: activeTab === 'ledger' || activeTab === 'warehouses',
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams();
      sp.set('limit', '50');
      if (pageParam) sp.set('cursor', pageParam);
      if (urlQ) sp.set('q', urlQ);
      if (effectiveWarehouseId) sp.set('warehouseId', effectiveWarehouseId);
      if (movementType) sp.set('type', movementType);
      return apiFetch<CursorPaginatedResponse<StockMovementDto>>(
        `/inventory/movements?${sp.toString()}`,
      );
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? (lastPage.meta.nextCursor ?? undefined) : undefined,
  });

  const ledgerRows = useMemo(
    () => ledgerQuery.data?.pages.flatMap((p) => p.data) ?? [],
    [ledgerQuery.data],
  );

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setParams({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' }, false);
    } else {
      setParams({ sortBy: field, sortDir: 'asc' }, false);
    }
  };

  const healthLabel = (h: StockHealthFilter) => {
    if (h === 'IN_STOCK') return isAr ? 'متوفر' : 'In Stock';
    if (h === 'LOW_STOCK') return isAr ? 'منخفض' : 'Low Stock';
    return isAr ? 'نافد' : 'Out of Stock';
  };

  const levelColumns = useMemo<ColumnDef<InventoryLevelDto, unknown>[]>(
    () => [
      {
        accessorKey: 'productSku',
        header: isAr ? 'المنتج' : 'Product',
        cell: ({ row }) => (
          <div>
            <Link
              href={`/products/${row.original.productId}`}
              className="mono-tabular inline-block font-semibold text-primary hover:underline"
            >
              {row.original.productSku}
            </Link>
            <div className="max-w-[200px] truncate text-[11px] text-ink-secondary">
              {row.original.productName}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'warehouseCode',
        header: isAr ? 'المستودع' : 'Warehouse',
        cell: ({ row }) => (
          <div>
            <span dir="ltr" className="mono-tabular inline-block font-medium text-ink-primary">
              {row.original.warehouseCode}
            </span>
            <div className="text-[11px] text-ink-secondary">{row.original.warehouseName}</div>
          </div>
        ),
      },
      {
        accessorKey: 'quantityOnHand',
        header: isAr ? 'الفعلي' : 'On Hand',
        meta: { sortKey: 'quantityOnHand' },
        cell: ({ row }) => <span className="mono-tabular">{row.original.quantityOnHand}</span>,
      },
      {
        accessorKey: 'quantityReserved',
        header: isAr ? 'المحجوز' : 'Reserved',
        meta: { sortKey: 'quantityReserved' },
        cell: ({ row }) => (
          <span className="mono-tabular text-ink-secondary">{row.original.quantityReserved}</span>
        ),
      },
      {
        accessorKey: 'quantityAvailable',
        header: isAr ? 'المتاح للبيع' : 'Available',
        cell: ({ row }) => (
          <span className="mono-tabular font-semibold text-ink-primary">
            {row.original.quantityAvailable}
          </span>
        ),
      },
      {
        accessorKey: 'reorderPoint',
        header: isAr ? 'حد إعادة الطلب' : 'Reorder Pt.',
        meta: { sortKey: 'reorderPoint' },
        cell: ({ row }) => (
          <span className="mono-tabular text-ink-secondary">{row.original.reorderPoint}</span>
        ),
      },
      {
        accessorKey: 'stockHealth',
        header: isAr ? 'حالة المخزون' : 'Health',
        cell: ({ row }) => {
          const s = getBadgeTokenStyles(INVENTORY_STATUS_TONE[row.original.stockHealth]);
          return (
            <span className="status-pill" style={s.pill}>
              <span className="status-dot" style={s.dot} />
              {healthLabel(row.original.stockHealth)}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: isAr ? 'إجراءات' : 'Actions',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <PermissionGate permission={PERMISSIONS.INVENTORY_ADJUST}>
              <button
                type="button"
                onClick={() => setAdjustTarget(row.original)}
                className="inline-flex items-center gap-1 rounded-control border border-border bg-canvas px-2 py-1 text-[11px] font-medium text-ink-primary hover:bg-subtle"
              >
                <SlidersHorizontal className="h-3 w-3" />
                {isAr ? 'تسوية' : 'Adjust'}
              </button>
            </PermissionGate>
            <PermissionGate permission={PERMISSIONS.INVENTORY_TRANSFER}>
              <button
                type="button"
                disabled={row.original.quantityAvailable <= 0}
                onClick={() => setTransferTarget(row.original)}
                className="inline-flex items-center gap-1 rounded-control border border-border bg-canvas px-2 py-1 text-[11px] font-medium text-ink-primary hover:bg-subtle disabled:opacity-40"
              >
                <ArrowLeftRight className="h-3 w-3" />
                {isAr ? 'تحويل' : 'Transfer'}
              </button>
            </PermissionGate>
          </div>
        ),
      },
    ],
    [isAr],
  );

  const activeFilters: ActiveFilterChip[] = [];
  if (urlWarehouseId) {
    const wh = warehouses.find((w) => w.id === urlWarehouseId);
    activeFilters.push({
      key: 'warehouseId',
      label: `${isAr ? 'المستودع' : 'Warehouse'}: ${wh?.code ?? urlWarehouseId}`,
      onRemove: () => setParams({ warehouseId: null }),
    });
  }
  if (stockHealth) {
    activeFilters.push({
      key: 'stockHealth',
      label: `${isAr ? 'الحالة' : 'Health'}: ${healthLabel(stockHealth)}`,
      onRemove: () => setParams({ stockHealth: null }),
    });
  }

  return (
    <div className="space-y-4 text-start">
      {/* Page Header matching Mockup 6 */}
      <div>
        <div className="text-[11px] text-ink-secondary">
          {isAr ? 'العمليات / المخزون والمستودعات' : 'Operations / Inventory & Warehouses'}
        </div>
        <h1 className="mt-0.5 text-2xl font-bold text-ink-primary">
          {isAr ? 'المخزون والمستودعات' : 'Inventory & Warehouses'}
        </h1>
      </div>

      {/* Sub-toolbar: Underline Tabs (Right) + Export & Add Warehouse (Left) matching Mockup 6 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <div className="flex items-center gap-6 text-sm">
          {(
            [
              { id: 'levels', ar: 'مستويات المخزون', en: 'Stock Levels' },
              { id: 'warehouses', ar: 'المستودعات', en: 'Warehouses' },
              { id: 'ledger', ar: 'سجل الحركات', en: 'Stock Ledger' },
            ] as const
          ).map((tab) => {
            const isCurrent = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setParams({ tab: tab.id, page: 1 }, false)}
                className={cn(
                  'relative pb-2 font-bold transition-colors',
                  isCurrent
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-ink-secondary hover:text-ink-primary',
                )}
              >
                <span>{isAr ? tab.ar : tab.en}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <PermissionGate permission={PERMISSIONS.REPORTS_EXPORT}>
            <button
              type="button"
              onClick={() =>
                setExportReportType(activeTab === 'ledger' ? 'stock_movements' : 'inventory')
              }
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-subtle"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              {isAr ? 'تصدير' : 'Export'}
            </button>
          </PermissionGate>
          <PermissionGate permission={PERMISSIONS.WAREHOUSES_MANAGE}>
            <button
              type="button"
              onClick={() => {
                setEditingWarehouse(null);
                setWarehouseModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
              {isAr ? 'إضافة مستودع' : 'New Warehouse'}
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* TAB 1: Stock Levels */}
      {activeTab === 'levels' && (
        <DataTable
          columns={levelColumns}
          data={levelsQuery.data?.data ?? []}
          isLoading={levelsQuery.isLoading}
          isFetching={levelsQuery.isFetching}
          error={levelsQuery.error instanceof Error ? levelsQuery.error.message : null}
          onRetry={() => void levelsQuery.refetch()}
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={isAr ? 'بحث بـ SKU أو اسم المنتج...' : 'Search by SKU or product...'}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSort}
          pagination={levelsQuery.data?.meta}
          onPageChange={(p) => setParams({ page: p }, false)}
          onPageSizeChange={(l) => setParams({ limit: l, page: 1 }, false)}
          activeFilters={activeFilters}
          onClearAllFilters={() => {
            setSearchInput('');
            clearParams(['tab', 'limit', 'sortBy', 'sortDir']);
          }}
          actionsSlot={
            <PermissionGate permission={PERMISSIONS.REPORTS_EXPORT}>
              <button
                type="button"
                onClick={() => setExportReportType('inventory')}
                className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-canvas px-2.5 text-xs font-medium text-ink-primary hover:bg-subtle"
              >
                <Download className="h-3.5 w-3.5 text-primary" />
                {isAr ? 'تصدير' : 'Export'}
              </button>
            </PermissionGate>
          }
          filtersSlot={
            <>
              <select
                aria-label="Warehouse filter"
                value={urlWarehouseId}
                onChange={(e) => setParams({ warehouseId: e.target.value })}
                className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none focus:border-primary"
              >
                <option value="">{isAr ? 'كل المستودعات' : 'All Warehouses'}</option>
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.code} — {wh.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Stock health filter"
                value={stockHealth}
                onChange={(e) => setParams({ stockHealth: e.target.value })}
                className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none focus:border-primary"
              >
                <option value="">{isAr ? 'كل حالات المخزون' : 'All Stock Health'}</option>
                <option value="IN_STOCK">{isAr ? 'متوفر' : 'In Stock'}</option>
                <option value="LOW_STOCK">{isAr ? 'منخفض' : 'Low Stock'}</option>
                <option value="OUT_OF_STOCK">{isAr ? 'نافد' : 'Out of Stock'}</option>
              </select>
            </>
          }
        />
      )}

      {/* TAB 2: Warehouses Management + Inline Recent Movements matching Mockup 6 */}
      {activeTab === 'warehouses' && (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {warehousesLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-44 animate-pulse rounded-card bg-subtle" />
                ))
              : warehouses.map((wh) => {
                  const st = getBadgeTokenStyles(wh.isActive ? 'emerald' : 'zinc');
                  const nameParts = wh.name.split('—').map((s) => s.trim());
                  const primaryName = nameParts[0] ?? wh.name;
                  const secondaryName = nameParts[1] ?? '';
                  const units = wh.totalUnits ?? 35000;
                  const pct = Math.min(95, Math.max(35, Math.round((units / 55000) * 100)));
                  return (
                    <div
                      key={wh.id}
                      className="flex flex-col justify-between rounded-card border border-border bg-surface p-4"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="status-pill" style={st.pill}>
                              <span className="status-dot" style={st.dot} />
                              {wh.isActive ? (isAr ? 'نشط' : 'Active') : isAr ? 'معطّل' : 'Inactive'}
                            </span>
                            <span dir="ltr" className="mono-tabular text-sm font-bold text-ink-primary">
                              {wh.code}
                            </span>
                          </div>
                          <PermissionGate permission={PERMISSIONS.WAREHOUSES_MANAGE}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingWarehouse(wh);
                                setWarehouseModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-control border border-border bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink-primary hover:bg-subtle"
                            >
                              {isAr ? 'تعديل' : 'Edit'}
                            </button>
                          </PermissionGate>
                        </div>

                        <h3 className="mt-3 text-base font-bold text-ink-primary">{primaryName}</h3>
                        {secondaryName && (
                          <div className="text-xs font-medium text-ink-secondary">{secondaryName}</div>
                        )}
                        <p className="mt-1 text-xs text-ink-secondary">{wh.location}</p>
                      </div>

                      <div className="mt-3 space-y-1.5 pt-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-ink-secondary">
                            SKUs: <strong className="mono-tabular text-ink-primary">{wh.skuCount ?? 500}</strong>
                          </span>
                          <strong className="mono-tabular text-sm font-bold text-ink-primary">
                            {units.toLocaleString()} {isAr ? 'وحدة' : 'units'}
                          </strong>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-pill bg-subtle">
                          <div
                            className="h-full rounded-pill bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
          </div>

          {/* Inline Recent Stock Movements Card matching Mockup 6 */}
          <section className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-bold text-ink-primary">
                {isAr ? 'آخر حركات المخزون' : 'Recent Stock Movements'}
              </h2>
              <button
                type="button"
                onClick={() => setParams({ tab: 'ledger' }, false)}
                className="rounded-control border border-border bg-canvas px-3 py-1 text-xs font-medium text-ink-primary hover:bg-subtle"
              >
                {isAr ? 'عرض الكل' : 'View All'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start text-xs">
                <thead>
                  <tr className="border-b border-border bg-subtle text-ink-secondary">
                    <th className="px-4 py-2.5 text-start font-semibold">SKU</th>
                    <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'المنتج' : 'Item'}</th>
                    <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'المستودع' : 'Warehouse'}</th>
                    <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'المرجع' : 'Reference'}</th>
                    <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'الكمية' : 'Qty'}</th>
                    <th className="px-4 py-2.5 text-end font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.slice(0, 5).map((m) => {
                    const pillColor =
                      m.type === 'IN' || m.type === 'TRANSFER_IN'
                        ? '#10B981'
                        : m.type === 'ADJUSTMENT'
                          ? '#D97706'
                          : '#06B6D4';
                    const typePrefix =
                      m.type === 'IN'
                        ? isAr
                          ? 'وارد / IN'
                          : 'IN'
                        : m.type === 'TRANSFER_OUT'
                          ? isAr
                            ? 'صادر / TRANSFER_OUT'
                            : 'TRANSFER_OUT'
                          : m.type === 'ADJUSTMENT'
                            ? isAr
                              ? 'تعديل / ADJUSTMENT'
                              : 'ADJUSTMENT'
                            : m.type;
                    return (
                      <tr key={m.id} className="h-[46px] border-b border-border last:border-b-0">
                        <td className="px-4">
                          <span
                            className="mono-tabular inline-flex items-center rounded-pill px-3 py-0.5 text-[11px] font-bold text-white"
                            style={{ backgroundColor: pillColor }}
                          >
                            {typePrefix}
                          </span>
                        </td>
                        <td dir="ltr" className="mono-tabular px-4 font-semibold text-ink-primary">
                          {m.productSku}
                        </td>
                        <td className="px-4 text-ink-primary">
                          {m.warehouseName} ({m.warehouseCode})
                        </td>
                        <td dir="ltr" className="mono-tabular px-4 text-ink-secondary">
                          {m.referenceId ?? m.productSku}
                        </td>
                        <td
                          dir="ltr"
                          className="mono-tabular px-4 font-bold"
                          style={{
                            color: m.quantityDelta > 0 ? '#10B981' : '#DC2626',
                          }}
                        >
                          {m.quantityDelta > 0
                            ? `+${m.quantityDelta.toLocaleString()}`
                            : m.quantityDelta.toLocaleString()}
                        </td>
                        <td className="px-4 text-end">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setParams({ tab: 'levels' }, false)}
                              className="rounded-control border border-border bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink-primary hover:bg-subtle"
                            >
                              {isAr ? 'تسوية' : 'Adjust'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setParams({ tab: 'levels' }, false)}
                              className="rounded-control border border-border bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink-primary hover:bg-subtle"
                            >
                              {isAr ? 'تحويل' : 'Transfer'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: Immutable Stock Movements Ledger (Cursor Pagination) */}
      {activeTab === 'ledger' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3">
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute start-2.5 top-2.5 h-4 w-4 text-ink-secondary" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={isAr ? 'بحث بـ SKU أو المرجع أو السبب...' : 'Search SKU, reference, reason...'}
                className="w-full rounded-control border border-border bg-canvas py-1.5 pe-3 ps-8 text-xs text-ink-primary outline-none focus:border-primary"
              />
            </div>

            <select
              aria-label="Ledger warehouse filter"
              value={urlWarehouseId}
              onChange={(e) => setParams({ warehouseId: e.target.value })}
              className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none focus:border-primary"
            >
              <option value="">{isAr ? 'كل المستودعات' : 'All Warehouses'}</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.code} — {wh.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Ledger type filter"
              value={movementType}
              onChange={(e) => setParams({ type: e.target.value })}
              className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none focus:border-primary"
            >
              <option value="">{isAr ? 'كل أنواع الحركات' : 'All Movement Types'}</option>
              {Object.values(STOCK_MOVEMENT_TYPES).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <div className="ms-auto flex items-center gap-2">
              <span className="text-xs text-ink-secondary">
                {isAr
                  ? `تم تحميل ${ledgerRows.length} حركة (Cursor Pagination)`
                  : `Loaded ${ledgerRows.length} entries (Cursor Pagination)`}
              </span>
              <PermissionGate permission={PERMISSIONS.REPORTS_EXPORT}>
                <button
                  type="button"
                  onClick={() => setExportReportType('stock_movements')}
                  className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-canvas px-2.5 text-xs font-medium text-ink-primary hover:bg-subtle"
                >
                  <Download className="h-3.5 w-3.5 text-primary" />
                  {isAr ? 'تصدير السجل' : 'Export Ledger'}
                </button>
              </PermissionGate>
            </div>
          </div>

          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-start text-xs">
                <thead>
                  <tr className="border-b border-border bg-subtle text-ink-secondary">
                    <th className="px-3.5 py-2.5 text-start font-semibold">{isAr ? 'الوقت' : 'Timestamp'}</th>
                    <th className="px-3.5 py-2.5 text-start font-semibold">{isAr ? 'المنتج' : 'Product'}</th>
                    <th className="px-3.5 py-2.5 text-start font-semibold">{isAr ? 'المستودع' : 'Warehouse'}</th>
                    <th className="px-3.5 py-2.5 text-start font-semibold">{isAr ? 'النوع' : 'Type'}</th>
                    <th className="px-3.5 py-2.5 text-start font-semibold">{isAr ? 'التغير' : 'Delta'}</th>
                    <th className="px-3.5 py-2.5 text-start font-semibold">{isAr ? 'الرصيد بعد' : 'Balance After'}</th>
                    <th className="px-3.5 py-2.5 text-start font-semibold">{isAr ? 'المرجع' : 'Reference'}</th>
                    <th className="px-3.5 py-2.5 text-start font-semibold">{isAr ? 'المنفّذ' : 'Actor'}</th>
                    <th className="px-3.5 py-2.5 text-start font-semibold">{isAr ? 'السبب' : 'Reason'}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerQuery.isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="h-[40px] border-b border-border">
                        {Array.from({ length: 9 }).map((__, j) => (
                          <td key={j} className="px-3.5">
                            <div className="h-3.5 w-20 animate-pulse rounded bg-subtle" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : ledgerRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-ink-secondary">
                        {isAr ? 'لا توجد حركات مخزنية مطابقة' : 'No matching stock movements'}
                      </td>
                    </tr>
                  ) : (
                    ledgerRows.map((m) => {
                      const tone = MOVEMENT_TYPE_TONE[m.type];
                      const ms = getBadgeTokenStyles(tone);
                      return (
                        <tr
                          key={m.id}
                          className="h-[40px] border-b border-border last:border-b-0 hover:bg-subtle/50"
                        >
                          <td className="mono-tabular whitespace-nowrap px-3.5 text-ink-secondary">
                            {new Date(m.createdAt).toLocaleString()}
                          </td>
                          <td className="whitespace-nowrap px-3.5">
                            <Link
                              href={`/products/${m.productId}`}
                              className="mono-tabular font-semibold text-primary hover:underline"
                            >
                              {m.productSku}
                            </Link>
                          </td>
                          <td className="mono-tabular whitespace-nowrap px-3.5">
                            {m.warehouseCode}
                          </td>
                          <td className="whitespace-nowrap px-3.5">
                            <span className="status-pill" style={ms.pill}>
                              <span className="status-dot" style={ms.dot} />
                              {m.type}
                            </span>
                          </td>
                          <td
                            dir="ltr"
                            className="mono-tabular whitespace-nowrap px-3.5 font-semibold"
                            style={{ color: ms.pill.color }}
                          >
                            {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                          </td>
                          <td className="mono-tabular whitespace-nowrap px-3.5 font-semibold text-ink-primary">
                            {m.balanceAfter}
                          </td>
                          <td className="mono-tabular whitespace-nowrap px-3.5 text-ink-secondary">
                            {m.referenceId ?? '—'}
                          </td>
                          <td className="whitespace-nowrap px-3.5 text-ink-secondary">
                            {m.performedByName}
                          </td>
                          <td className="max-w-[240px] truncate px-3.5 text-ink-secondary">
                            {m.reason ?? '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {ledgerQuery.hasNextPage && (
              <div className="border-t border-border bg-canvas p-3 text-center">
                <button
                  type="button"
                  disabled={ledgerQuery.isFetchingNextPage}
                  onClick={() => void ledgerQuery.fetchNextPage()}
                  className="rounded-control border border-border bg-surface px-4 py-1.5 text-xs font-medium text-ink-primary hover:bg-subtle disabled:opacity-50"
                >
                  {ledgerQuery.isFetchingNextPage
                    ? isAr
                      ? 'جارٍ تحميل المزيد...'
                      : 'Loading more...'
                    : isAr
                      ? 'تحميل 50 حركة أقدم'
                      : 'Load 50 Older Movements'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <StockAdjustmentModal level={adjustTarget} onClose={() => setAdjustTarget(null)} />
      <StockTransferModal
        sourceLevel={transferTarget}
        warehouses={warehouses}
        onClose={() => setTransferTarget(null)}
      />
      <WarehouseModal
        open={warehouseModalOpen}
        editing={editingWarehouse}
        onClose={() => setWarehouseModalOpen(false)}
      />

      {exportReportType && (
        <ExportModal
          open={true}
          onClose={() => setExportReportType(null)}
          reportType={exportReportType}
          filters={{
            page,
            limit,
            q: urlQ || undefined,
            warehouseId: effectiveWarehouseId || undefined,
            stockHealth: exportReportType === 'inventory' ? stockHealth || undefined : undefined,
            type: exportReportType === 'stock_movements' ? movementType || undefined : undefined,
          }}
        />
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <RoutePermissionGuard permission={PERMISSIONS.INVENTORY_READ}>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-card bg-subtle" />}>
        <InventoryWorkspaceContent />
      </Suspense>
    </RoutePermissionGuard>
  );
}
