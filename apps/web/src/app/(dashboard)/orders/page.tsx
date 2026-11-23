'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ORDER_STATUSES,
  PERMISSIONS,
  type BulkActionResult,
  type OffsetPaginatedResponse,
  type OrderListItemDto,
  type OrderStatus,
  type WarehouseDto,
} from '@omni-ops/shared';
import { Download, Eye, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DataTable, type ActiveFilterChip } from '@/components/data-table/data-table';
import { PermissionGate, RoutePermissionGuard } from '@/components/rbac/permission-gate';
import { CreateOrderDrawer } from '@/features/orders/create-order-drawer';
import { ExportModal } from '@/features/reports/export-modal';
import { useDebounce } from '@/hooks/use-debounce';
import { useUrlTableState } from '@/hooks/use-url-table-state';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuth, useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';
import { getBadgeTokenStyles, ORDER_STATUS_TONE } from '@/styles/status-badges';

function OrdersManagementContent() {
  const { locale, activeWarehouseId } = useUi();
  const { can } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const isAr = locale === 'ar';

  const { getParam, getNumberParam, setParams, clearParams } = useUrlTableState();

  const page = getNumberParam('page', 1);
  const limit = getNumberParam('limit', 20);
  const sortBy = getParam('sortBy', 'createdAt');
  const sortDir = (getParam('sortDir', 'desc') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const urlQ = getParam('q', '');
  const statusFilter = getParam('status', '');
  const urlWarehouseId = getParam('warehouseId', '');
  const effectiveWarehouseId =
    urlWarehouseId || (activeWarehouseId !== 'ALL' ? activeWarehouseId : '');

  const [searchInput, setSearchInput] = useState(urlQ);
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    if (debouncedSearch !== urlQ) {
      setParams({ q: debouncedSearch });
    }
  }, [debouncedSearch, urlQ, setParams]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiFetch<WarehouseDto[]>('/warehouses'),
  });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [
      'orders',
      { page, limit, sortBy, sortDir, q: urlQ, status: statusFilter, warehouseId: effectiveWarehouseId },
    ],
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set('page', String(page));
      sp.set('limit', String(limit));
      sp.set('sortBy', sortBy);
      sp.set('sortDir', sortDir);
      if (urlQ) sp.set('q', urlQ);
      if (statusFilter) sp.set('status', statusFilter);
      if (effectiveWarehouseId) sp.set('warehouseId', effectiveWarehouseId);
      return apiFetch<OffsetPaginatedResponse<OrderListItemDto>>(`/orders?${sp.toString()}`);
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, toStatus }: { ids: string[]; toStatus: OrderStatus }) =>
      apiFetch<BulkActionResult>('/orders/bulk-status', {
        method: 'POST',
        body: { ids, toStatus },
      }),
    onSuccess: (res, vars) => {
      setSelectedIds([]);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-levels'] });
      pushToast({
        variant: res.failed.length > 0 ? 'info' : 'success',
        title: isAr
          ? `تم تحديث ${res.succeededIds.length} طلب إلى ${vars.toStatus}`
          : `Transitioned ${res.succeededIds.length} order(s) to ${vars.toStatus}`,
        description:
          res.failed.length > 0
            ? `${res.failed.length} skipped: ${res.failed[0]?.reason}`
            : undefined,
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل تحديث الطلبات' : 'Bulk transition failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setParams({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' }, false);
    } else {
      setParams({ sortBy: field, sortDir: 'desc' }, false);
    }
  };

  const columns = useMemo<ColumnDef<OrderListItemDto, unknown>[]>(
    () => [
      {
        accessorKey: 'orderNumber',
        header: isAr ? 'رقم الطلب' : 'Order #',
        meta: { sortKey: 'orderNumber' },
        cell: ({ row }) => (
          <Link
            href={`/orders/${row.original.id}`}
            dir="ltr"
            className="mono-tabular inline-block font-semibold text-primary hover:underline"
          >
            {row.original.orderNumber}
          </Link>
        ),
      },
      {
        accessorKey: 'customerName',
        header: isAr ? 'العميل' : 'Customer',
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-ink-primary">{row.original.customerName}</div>
            {row.original.customerCompany && (
              <div className="text-[11px] text-ink-secondary">{row.original.customerCompany}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'warehouseCode',
        header: isAr ? 'المستودع' : 'Warehouse',
        cell: ({ row }) => (
          <span dir="ltr" className="mono-tabular inline-block text-ink-secondary">
            {row.original.warehouseCode}
          </span>
        ),
      },
      {
        accessorKey: 'itemCount',
        header: isAr ? 'البنود' : 'Items',
        cell: ({ row }) => <span className="mono-tabular">{row.original.itemCount}</span>,
      },
      {
        accessorKey: 'totalAmount',
        header: isAr ? 'الإجمالي' : 'Total',
        meta: { sortKey: 'totalAmount' },
        cell: ({ row }) => (
          <span className="mono-tabular font-semibold text-ink-primary">
            ${row.original.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: isAr ? 'الحالة' : 'Status',
        meta: { sortKey: 'status' },
        cell: ({ row }) => {
          const st = getBadgeTokenStyles(ORDER_STATUS_TONE[row.original.status]);
          return (
            <span className="status-pill" style={st.pill}>
              <span className="status-dot" style={st.dot} />
              {row.original.status}
            </span>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: isAr ? 'تاريخ الإنشاء' : 'Created',
        meta: { sortKey: 'createdAt' },
        cell: ({ row }) => (
          <span className="mono-tabular text-ink-secondary">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'actions',
        header: isAr ? 'إجراءات' : 'Actions',
        enableHiding: false,
        cell: ({ row }) => (
          <Link
            href={`/orders/${row.original.id}`}
            className="inline-flex items-center gap-1 rounded-control border border-border bg-canvas px-2 py-1 text-[11px] font-medium text-ink-primary hover:bg-subtle"
          >
            <Eye className="h-3 w-3" />
            {isAr ? 'التفاصيل' : 'Details'}
          </Link>
        ),
      },
    ],
    [isAr],
  );

  const activeFilters: ActiveFilterChip[] = [];
  if (statusFilter) {
    activeFilters.push({
      key: 'status',
      label: `${isAr ? 'الحالة' : 'Status'}: ${statusFilter}`,
      onRemove: () => setParams({ status: null }),
    });
  }
  if (urlWarehouseId) {
    const wh = warehouses.find((w) => w.id === urlWarehouseId);
    activeFilters.push({
      key: 'warehouseId',
      label: `${isAr ? 'المستودع' : 'Warehouse'}: ${wh?.code ?? urlWarehouseId}`,
      onRemove: () => setParams({ warehouseId: null }),
    });
  }

  return (
    <div className="space-y-4 text-start">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-primary">
            {isAr ? 'إدارة الطلبات (Orders Management)' : 'Orders Management'}
          </h1>
          <p className="mt-0.5 text-xs text-ink-secondary">
            {isAr
              ? 'إدارة 25,000+ طلب مع دورة حجز وخصم المخزون الذرية والإجراءات الجماعية.'
              : 'Manage 25,000+ orders with atomic inventory reservation, state machine & bulk transitions.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PermissionGate permission={PERMISSIONS.REPORTS_EXPORT}>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3 py-2 text-xs font-medium text-ink-primary hover:bg-subtle"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              {isAr ? 'تصدير' : 'Export'}
            </button>
          </PermissionGate>
          <PermissionGate permission={PERMISSIONS.ORDERS_WRITE}>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
              {isAr ? 'إنشاء طلب جديد' : 'New Order'}
            </button>
          </PermissionGate>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        isFetching={isFetching}
        error={error instanceof Error ? error.message : null}
        onRetry={() => void refetch()}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder={isAr ? 'بحث برقم الطلب أو اسم العميل...' : 'Search order # or customer...'}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={handleSort}
        pagination={data?.meta}
        onPageChange={(p) => setParams({ page: p }, false)}
        onPageSizeChange={(l) => setParams({ limit: l, page: 1 }, false)}
        enableRowSelection={can(PERMISSIONS.ORDERS_WRITE)}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        activeFilters={activeFilters}
        onClearAllFilters={() => {
          setSearchInput('');
          clearParams(['limit', 'sortBy', 'sortDir']);
        }}
        filtersSlot={
          <>
            <select
              aria-label="Filter by order status"
              value={statusFilter}
              onChange={(e) => setParams({ status: e.target.value })}
              className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none focus:border-primary"
            >
              <option value="">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
              {Object.values(ORDER_STATUSES).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by warehouse"
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
          </>
        }
        bulkActionsSlot={(ids) => (
          <>
            <button
              type="button"
              disabled={bulkStatusMutation.isPending}
              onClick={() => bulkStatusMutation.mutate({ ids, toStatus: ORDER_STATUSES.CONFIRMED })}
              className="rounded-control bg-white/15 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/25"
            >
              {isAr ? 'تأكيد (CONFIRMED)' : 'Confirm'}
            </button>
            <button
              type="button"
              disabled={bulkStatusMutation.isPending}
              onClick={() => bulkStatusMutation.mutate({ ids, toStatus: ORDER_STATUSES.SHIPPED })}
              className="rounded-control bg-white/15 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/25"
            >
              {isAr ? 'شحن (SHIPPED)' : 'Ship'}
            </button>
            <button
              type="button"
              disabled={bulkStatusMutation.isPending}
              onClick={() => bulkStatusMutation.mutate({ ids, toStatus: ORDER_STATUSES.DELIVERED })}
              className="rounded-control bg-white/15 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/25"
            >
              {isAr ? 'تسليم (DELIVERED)' : 'Deliver'}
            </button>
          </>
        )}
      />

      <CreateOrderDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={(created) => router.push(`/orders/${created.id}`)}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportType="orders"
        filters={{
          page,
          limit,
          q: urlQ || undefined,
          status: statusFilter || undefined,
          warehouseId: effectiveWarehouseId || undefined,
        }}
      />
    </div>
  );
}

export default function OrdersPage() {
  return (
    <RoutePermissionGuard permission={PERMISSIONS.ORDERS_READ}>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-card bg-subtle" />}>
        <OrdersManagementContent />
      </Suspense>
    </RoutePermissionGuard>
  );
}
