'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  PERMISSIONS,
  type BulkActionResult,
  type CategoryDto,
  type OffsetPaginatedResponse,
  type ProductListItemDto,
  type StockHealthFilter,
} from '@omni-ops/shared';
import { Download, Eye, Pencil, Plus, Power, ShieldAlert, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { DataTable, type ActiveFilterChip } from '@/components/data-table/data-table';
import { PermissionGate, RoutePermissionGuard } from '@/components/rbac/permission-gate';
import { ProductDrawer } from '@/features/products/product-drawer';
import { ExportModal } from '@/features/reports/export-modal';
import { useDebounce } from '@/hooks/use-debounce';
import { useUrlTableState } from '@/hooks/use-url-table-state';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuth, useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';
import { getBadgeTokenStyles, INVENTORY_STATUS_TONE } from '@/styles/status-badges';

function ProductsCatalogContent() {
  const { locale, activeWarehouseId } = useUi();
  const { can } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isAr = locale === 'ar';

  const { getParam, getNumberParam, setParams, clearParams } = useUrlTableState();

  const page = getNumberParam('page', 1);
  const limit = getNumberParam('limit', 20);
  const sortBy = getParam('sortBy', 'updatedAt');
  const sortDir = (getParam('sortDir', 'desc') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const urlQ = getParam('q', '');
  const categoryId = getParam('categoryId', '');
  const isActive = getParam('isActive', '');
  const stockHealth = getParam('stockHealth', '') as StockHealthFilter | '';

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
  const [editingProduct, setEditingProduct] = useState<ProductListItemDto | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<ProductListItemDto | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<CategoryDto[]>('/categories'),
  });

  const queryKey = useMemo(
    () => [
      'products',
      { page, limit, sortBy, sortDir, q: urlQ, categoryId, isActive, stockHealth, activeWarehouseId },
    ],
    [page, limit, sortBy, sortDir, urlQ, categoryId, isActive, stockHealth, activeWarehouseId],
  );

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set('page', String(page));
      sp.set('limit', String(limit));
      sp.set('sortBy', sortBy);
      sp.set('sortDir', sortDir);
      if (urlQ) sp.set('q', urlQ);
      if (categoryId) sp.set('categoryId', categoryId);
      if (isActive) sp.set('isActive', isActive);
      if (stockHealth) sp.set('stockHealth', stockHealth);
      if (activeWarehouseId !== 'ALL') sp.set('warehouseId', activeWarehouseId);
      return apiFetch<OffsetPaginatedResponse<ProductListItemDto>>(`/products?${sp.toString()}`);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, nextActive }: { id: string; nextActive: boolean }) =>
      apiFetch(`/products/${id}`, { method: 'PATCH', body: { isActive: nextActive } }),
    onMutate: async ({ id, nextActive }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<OffsetPaginatedResponse<ProductListItemDto>>(queryKey);
      if (previous) {
        queryClient.setQueryData<OffsetPaginatedResponse<ProductListItemDto>>(queryKey, {
          ...previous,
          data: previous.data.map((item) =>
            item.id === id ? { ...item, isActive: nextActive } : item,
          ),
        });
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKey, ctx.previous);
      }
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل تحديث حالة المنتج' : 'Failed to update product status',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeletingProduct(null);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-levels'] });
      pushToast({
        variant: 'success',
        title: isAr ? 'تم حذف المنتج (حذف ناعم)' : 'Product soft-deleted',
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'تعذّر حذف المنتج' : 'Delete failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: ({ ids, nextActive }: { ids: string[]; nextActive: boolean }) =>
      apiFetch<BulkActionResult>('/products/bulk-status', {
        method: 'POST',
        body: { ids, isActive: nextActive },
      }),
    onSuccess: (res) => {
      setSelectedIds([]);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      pushToast({
        variant: res.failed.length > 0 ? 'info' : 'success',
        title: isAr
          ? `تم تحديث ${res.succeededIds.length} منتج`
          : `Updated ${res.succeededIds.length} products`,
        description:
          res.failed.length > 0
            ? isAr
              ? `تم تخطي ${res.failed.length} عنصر: ${res.failed[0]?.reason}`
              : `${res.failed.length} skipped: ${res.failed[0]?.reason}`
            : undefined,
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل الإجراء الجماعي' : 'Bulk action failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

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

  const columns = useMemo<ColumnDef<ProductListItemDto, unknown>[]>(
    () => [
      {
        accessorKey: 'sku',
        header: 'SKU',
        meta: { sortKey: 'sku' },
        cell: ({ row }) => (
          <Link
            href={`/products/${row.original.id}`}
            className="mono-tabular inline-block font-semibold text-primary hover:underline"
          >
            {row.original.sku}
          </Link>
        ),
      },
      {
        accessorKey: 'name',
        header: isAr ? 'اسم المنتج' : 'Product Name',
        meta: { sortKey: 'name' },
        cell: ({ row }) => (
          <Link
            href={`/products/${row.original.id}`}
            className="font-medium text-ink-primary hover:text-primary"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'categoryName',
        header: isAr ? 'التصنيف' : 'Category',
        cell: ({ row }) => <span className="text-ink-secondary">{row.original.categoryName}</span>,
      },
      {
        accessorKey: 'unitCost',
        header: isAr ? 'التكلفة' : 'Cost',
        meta: { sortKey: 'unitCost' },
        cell: ({ row }) => (
          <span className="mono-tabular text-ink-secondary">
            ${row.original.unitCost.toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: 'unitPrice',
        header: isAr ? 'سعر البيع' : 'Price',
        meta: { sortKey: 'unitPrice' },
        cell: ({ row }) => (
          <span className="mono-tabular font-semibold text-ink-primary">
            ${row.original.unitPrice.toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: 'totalAvailable',
        header: isAr ? 'المتاح / الإجمالي' : 'Available / On Hand',
        cell: ({ row }) => {
          const s = getBadgeTokenStyles(INVENTORY_STATUS_TONE[row.original.stockHealth]);
          return (
            <div className="flex items-center gap-2">
              <span dir="ltr" className="mono-tabular font-semibold text-ink-primary">
                {row.original.totalAvailable} / {row.original.totalOnHand}
              </span>
              <span className="status-pill" style={s.pill}>
                <span className="status-dot" style={s.dot} />
                {healthLabel(row.original.stockHealth)}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'isActive',
        header: isAr ? 'الحالة' : 'Status',
        meta: { sortKey: 'isActive' },
        cell: ({ row }) => {
          const st = getBadgeTokenStyles(row.original.isActive ? 'emerald' : 'zinc');
          return (
            <span className="status-pill" style={st.pill}>
              <span className="status-dot" style={st.dot} />
              {row.original.isActive
                ? isAr
                  ? 'نشط'
                  : 'Active'
                : isAr
                  ? 'معطّل'
                  : 'Inactive'}
            </span>
          );
        },
      },
      {
        accessorKey: 'updatedAt',
        header: isAr ? 'آخر تحديث' : 'Updated',
        meta: { sortKey: 'updatedAt' },
        cell: ({ row }) => (
          <span className="mono-tabular text-ink-secondary">
            {new Date(row.original.updatedAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'actions',
        header: isAr ? 'إجراءات' : 'Actions',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Link
              href={`/products/${row.original.id}`}
              title={isAr ? 'عرض التفاصيل' : 'View details'}
              className="rounded-control p-1.5 text-ink-secondary hover:bg-subtle hover:text-ink-primary"
            >
              <Eye className="h-3.5 w-3.5" />
            </Link>
            <PermissionGate permission={PERMISSIONS.PRODUCTS_WRITE}>
              <button
                type="button"
                title={isAr ? 'تعديل' : 'Edit'}
                onClick={() => {
                  setEditingProduct(row.original);
                  setDrawerOpen(true);
                }}
                className="rounded-control p-1.5 text-ink-secondary hover:bg-subtle hover:text-ink-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={
                  row.original.isActive
                    ? isAr
                      ? 'تعطيل'
                      : 'Deactivate'
                    : isAr
                      ? 'تفعيل'
                      : 'Activate'
                }
                onClick={() =>
                  toggleActiveMutation.mutate({
                    id: row.original.id,
                    nextActive: !row.original.isActive,
                  })
                }
                className="rounded-control p-1.5 text-ink-secondary hover:bg-subtle hover:text-ink-primary"
              >
                <Power className="h-3.5 w-3.5" />
              </button>
            </PermissionGate>
            <PermissionGate permission={PERMISSIONS.PRODUCTS_DELETE}>
              <button
                type="button"
                title={isAr ? 'حذف ناعم' : 'Soft delete'}
                onClick={() => setDeletingProduct(row.original)}
                className="rounded-control p-1.5 hover:bg-subtle"
                style={{ color: 'var(--status-rose-text)' }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </PermissionGate>
          </div>
        ),
      },
    ],
    [isAr, toggleActiveMutation],
  );

  const activeFilters: ActiveFilterChip[] = [];
  if (categoryId) {
    const catName = categories.find((c) => c.id === categoryId)?.name ?? categoryId;
    activeFilters.push({
      key: 'categoryId',
      label: `${isAr ? 'التصنيف' : 'Category'}: ${catName}`,
      onRemove: () => setParams({ categoryId: null }),
    });
  }
  if (isActive) {
    activeFilters.push({
      key: 'isActive',
      label: `${isAr ? 'الحالة' : 'Status'}: ${isActive === 'true' ? (isAr ? 'نشط' : 'Active') : isAr ? 'معطّل' : 'Inactive'}`,
      onRemove: () => setParams({ isActive: null }),
    });
  }
  if (stockHealth) {
    activeFilters.push({
      key: 'stockHealth',
      label: `${isAr ? 'المخزون' : 'Stock'}: ${healthLabel(stockHealth)}`,
      onRemove: () => setParams({ stockHealth: null }),
    });
  }

  return (
    <div className="space-y-4 text-start">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-primary">
            {isAr ? 'دليل المنتجات (Products Catalog)' : 'Products Catalog'}
          </h1>
          <p className="mt-0.5 text-xs text-ink-secondary">
            {isAr
              ? 'إدارة المنتجات، التسعير، ومستويات التوفر مع مزامنة الفلاتر عبر الرابط.'
              : 'Server-side catalog with URL-synced filtering, sorting, and bulk actions.'}
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
          <PermissionGate permission={PERMISSIONS.PRODUCTS_WRITE}>
            <button
              type="button"
              onClick={() => {
                setEditingProduct(null);
                setDrawerOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
              {isAr ? 'إضافة منتج' : 'New Product'}
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
        searchPlaceholder={isAr ? 'بحث بـ SKU أو اسم المنتج...' : 'Search by SKU or product name...'}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={handleSort}
        pagination={data?.meta}
        onPageChange={(p) => setParams({ page: p }, false)}
        onPageSizeChange={(l) => setParams({ limit: l, page: 1 }, false)}
        enableRowSelection={can(PERMISSIONS.PRODUCTS_WRITE)}
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
              aria-label="Filter by category"
              value={categoryId}
              onChange={(e) => setParams({ categoryId: e.target.value })}
              className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none focus:border-primary"
            >
              <option value="">{isAr ? 'كل التصنيفات' : 'All Categories'}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by stock health"
              value={stockHealth}
              onChange={(e) => setParams({ stockHealth: e.target.value })}
              className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none focus:border-primary"
            >
              <option value="">{isAr ? 'كل حالات التوفر' : 'All Stock Health'}</option>
              <option value="IN_STOCK">{isAr ? 'متوفر' : 'In Stock'}</option>
              <option value="LOW_STOCK">{isAr ? 'منخفض' : 'Low Stock'}</option>
              <option value="OUT_OF_STOCK">{isAr ? 'نافد' : 'Out of Stock'}</option>
            </select>

            <select
              aria-label="Filter by active status"
              value={isActive}
              onChange={(e) => setParams({ isActive: e.target.value })}
              className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none focus:border-primary"
            >
              <option value="">{isAr ? 'الكل (نشط/معطّل)' : 'All Statuses'}</option>
              <option value="true">{isAr ? 'نشط فقط' : 'Active only'}</option>
              <option value="false">{isAr ? 'معطّل فقط' : 'Inactive only'}</option>
            </select>
          </>
        }
        bulkActionsSlot={(ids) => (
          <>
            <button
              type="button"
              disabled={bulkStatusMutation.isPending}
              onClick={() => bulkStatusMutation.mutate({ ids, nextActive: true })}
              className="rounded-control bg-white/15 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/25"
            >
              {isAr ? 'تفعيل المحدد' : 'Activate Selected'}
            </button>
            <button
              type="button"
              disabled={bulkStatusMutation.isPending}
              onClick={() => bulkStatusMutation.mutate({ ids, nextActive: false })}
              className="rounded-control bg-white/15 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/25"
            >
              {isAr ? 'تعطيل المحدد' : 'Deactivate Selected'}
            </button>
          </>
        )}
      />

      <ProductDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        categories={categories}
        editingProduct={editingProduct}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportType="products"
        filters={{
          page,
          limit,
          q: urlQ || undefined,
          categoryId: categoryId || undefined,
          isActive: isActive || undefined,
          stockHealth: stockHealth || undefined,
          warehouseId: activeWarehouseId !== 'ALL' ? activeWarehouseId : undefined,
        }}
      />

      {deletingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDeletingProduct(null)}
        >
          <div
            className="w-full max-w-sm rounded-card border border-border bg-surface p-5 text-start"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" style={{ color: 'var(--status-rose-dot)' }} />
              <h3 className="text-sm font-bold text-ink-primary">
                {isAr ? 'تأكيد الحذف الناعم للمنتج' : 'Confirm Soft Delete'}
              </h3>
            </div>
            <p className="mt-2 text-xs text-ink-secondary">
              {isAr
                ? `هل تريد حذف المنتج ${deletingProduct.name} (${deletingProduct.sku})؟ سيظل مسجلاً في الطلبات التاريخية وسيتاح إعادة استخدام الـ SKU لاحقاً.`
                : `Soft-delete ${deletingProduct.name} (${deletingProduct.sku})? Historical orders remain intact and the SKU can be reused later.`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingProduct(null)}
                className="rounded-control border border-border bg-canvas px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-subtle"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deletingProduct.id)}
                className="rounded-control px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--status-rose-dot)' }}
              >
                {isAr ? 'تأكيد الحذف' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <RoutePermissionGuard permission={PERMISSIONS.PRODUCTS_READ}>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-card bg-subtle" />}>
        <ProductsCatalogContent />
      </Suspense>
    </RoutePermissionGuard>
  );
}
