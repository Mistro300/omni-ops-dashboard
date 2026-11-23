'use client';

import { useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table';
import type { OffsetPaginationMeta } from '@omni-ops/shared';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Inbox,
  RefreshCw,
  Rows3,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUi } from '@/providers/app-providers';

export interface ActiveFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export interface DataTableProps<T extends { id: string }> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  isLoading: boolean;
  isFetching?: boolean;
  error?: string | null;
  onRetry?: () => void;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (field: string) => void;
  pagination?: OffsetPaginationMeta;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (limit: number) => void;
  filtersSlot?: ReactNode;
  actionsSlot?: ReactNode;
  activeFilters?: ActiveFilterChip[];
  onClearAllFilters?: () => void;
  enableRowSelection?: boolean;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  bulkActionsSlot?: (selectedIds: string[], clearSelection: () => void) => ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  stickyFirstColumn?: boolean;
  stickyLastColumn?: boolean;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  isLoading,
  isFetching = false,
  error = null,
  onRetry,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  sortBy,
  sortDir,
  onSortChange,
  pagination,
  onPageChange,
  onPageSizeChange,
  filtersSlot,
  actionsSlot,
  activeFilters = [],
  onClearAllFilters,
  enableRowSelection = false,
  selectedIds = [],
  onSelectedIdsChange,
  bulkActionsSlot,
  emptyTitle,
  emptyDescription,
  stickyFirstColumn = true,
  stickyLastColumn = true,
}: DataTableProps<T>) {
  const { locale, dir } = useUi();
  const isAr = locale === 'ar';

  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);

  const table = useReactTable({
    data,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const allVisibleSelected =
    data.length > 0 && data.every((row) => selectedIds.includes(row.id));

  const toggleAllVisible = () => {
    if (!onSelectedIdsChange) return;
    if (allVisibleSelected) {
      const visibleSet = new Set(data.map((r) => r.id));
      onSelectedIdsChange(selectedIds.filter((id) => !visibleSet.has(id)));
    } else {
      const merged = new Set([...selectedIds, ...data.map((r) => r.id)]);
      onSelectedIdsChange(Array.from(merged).slice(0, 100));
    }
  };

  const toggleRow = (id: string) => {
    if (!onSelectedIdsChange) return;
    if (selectedIds.includes(id)) {
      onSelectedIdsChange(selectedIds.filter((x) => x !== id));
    } else if (selectedIds.length < 100) {
      onSelectedIdsChange([...selectedIds, id]);
    }
  };

  const rowHeightClass = density === 'compact' ? 'h-[40px]' : 'h-[52px]';
  const visibleColumns = table.getVisibleLeafColumns();
  const PrevIcon = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-card border border-border bg-surface p-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {onSearchChange !== undefined && (
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute start-2.5 top-2.5 h-4 w-4 text-ink-secondary" />
              <input
                type="text"
                value={searchValue ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder ?? (isAr ? 'بحث...' : 'Search...')}
                className="w-full rounded-control border border-border bg-canvas py-1.5 pe-8 ps-8 text-xs text-ink-primary outline-none focus:border-primary"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute end-2 top-2 text-ink-secondary hover:text-ink-primary"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {filtersSlot}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Density Toggle (Compact 40px / Comfortable 52px) */}
          <button
            type="button"
            onClick={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
            title={
              isAr
                ? `الكثافة: ${density === 'compact' ? 'مضغوط (40px)' : 'مريح (52px)'}`
                : `Density: ${density === 'compact' ? 'Compact (40px)' : 'Comfortable (52px)'}`
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-canvas px-2.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
          >
            <Rows3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {density === 'compact'
                ? isAr
                  ? 'مضغوط'
                  : 'Compact'
                : isAr
                  ? 'مريح'
                  : 'Comfortable'}
            </span>
          </button>

          {/* Column Visibility Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setColumnsMenuOpen((o) => !o)}
              className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-canvas px-2.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
            >
              <Columns3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isAr ? 'الأعمدة' : 'Columns'}</span>
            </button>

            {columnsMenuOpen && (
              <div className="absolute end-0 top-9 z-30 w-48 rounded-card border border-border bg-surface p-2 text-start">
                <div className="mb-1.5 flex items-center justify-between border-b border-border pb-1 text-[11px] font-semibold text-ink-secondary">
                  <span>{isAr ? 'إظهار / إخفاء الأعمدة' : 'Toggle Columns'}</span>
                  <button
                    type="button"
                    onClick={() => setColumnsMenuOpen(false)}
                    className="hover:text-ink-primary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-1">
                  {table
                    .getAllLeafColumns()
                    .filter((col) => col.getCanHide())
                    .map((col) => (
                      <label
                        key={col.id}
                        className="flex cursor-pointer items-center gap-2 rounded-control px-1.5 py-1 text-xs text-ink-primary hover:bg-subtle"
                      >
                        <input
                          type="checkbox"
                          checked={col.getIsVisible()}
                          onChange={col.getToggleVisibilityHandler()}
                          className="h-3.5 w-3.5 rounded accent-primary"
                        />
                        <span className="truncate">
                          {typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id}
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>

          {actionsSlot}
        </div>
      </div>

      {/* Active Filter Chips Strip */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-ink-secondary">{isAr ? 'الفلاتر النشطة:' : 'Active filters:'}</span>
          {activeFilters.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-2.5 py-0.5 text-xs text-ink-primary"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="text-ink-secondary hover:text-ink-primary"
                aria-label={`Remove ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {onClearAllFilters && (
            <button
              type="button"
              onClick={onClearAllFilters}
              className="px-2 py-0.5 text-xs font-medium text-primary hover:underline"
            >
              {isAr ? 'مسح الكل' : 'Clear all'}
            </button>
          )}
        </div>
      )}

      {/* Table Container */}
      <div className="relative overflow-hidden rounded-card border border-border bg-surface">
        {isFetching && !isLoading && (
          <div className="h-0.5 w-full animate-pulse bg-primary" />
        )}

        {error ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <AlertCircle className="h-8 w-8" style={{ color: 'var(--status-rose-dot)' }} />
            <div className="mt-2 text-sm font-semibold text-ink-primary">
              {isAr ? 'تعذّر تحميل البيانات' : 'Failed to load data'}
            </div>
            <p className="mt-1 max-w-md text-xs text-ink-secondary">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 inline-flex items-center gap-1.5 rounded-control border border-border bg-canvas px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-subtle"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {isAr ? 'إعادة المحاولة' : 'Retry'}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start text-sm">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-border bg-subtle">
                    {enableRowSelection && (
                      <th className="sticky start-0 z-20 w-10 bg-subtle px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                          aria-label="Select all visible rows"
                          className="h-3.5 w-3.5 rounded accent-primary"
                        />
                      </th>
                    )}
                    {headerGroup.headers.map((header, idx) => {
                      const isFirst = idx === 0 && stickyFirstColumn && !enableRowSelection;
                      const isLast =
                        idx === headerGroup.headers.length - 1 && stickyLastColumn;
                      const sortKey = (header.column.columnDef.meta as { sortKey?: string } | undefined)
                        ?.sortKey;
                      const isSorted = Boolean(sortKey && sortBy === sortKey);

                      return (
                        <th
                          key={header.id}
                          className={cn(
                            'whitespace-nowrap px-2.5 py-2.5 text-start text-xs font-semibold text-ink-secondary',
                            isFirst && 'sticky start-0 z-20 bg-subtle border-e border-border',
                            isLast && 'sticky end-0 z-20 bg-subtle border-s border-border',
                          )}
                        >
                          {sortKey && onSortChange ? (
                            <button
                              type="button"
                              onClick={() => onSortChange(sortKey)}
                              className="inline-flex items-center gap-1 hover:text-ink-primary"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {isSorted ? (
                                sortDir === 'asc' ? (
                                  <ArrowUp className="h-3 w-3 text-primary" />
                                ) : (
                                  <ArrowDown className="h-3 w-3 text-primary" />
                                )
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-50" />
                              )}
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>

              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, rowIdx) => (
                    <tr key={rowIdx} className={cn('border-b border-border', rowHeightClass)}>
                      {enableRowSelection && (
                        <td className="px-3">
                          <div className="mx-auto h-3.5 w-3.5 animate-pulse rounded bg-subtle" />
                        </td>
                      )}
                      {visibleColumns.map((col) => (
                        <td key={col.id} className="px-3.5">
                          <div className="h-3.5 w-24 animate-pulse rounded bg-subtle" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + (enableRowSelection ? 1 : 0)}
                      className="px-6 py-14 text-center"
                    >
                      <Inbox className="mx-auto h-8 w-8 text-ink-secondary opacity-60" />
                      <div className="mt-2 text-sm font-semibold text-ink-primary">
                        {emptyTitle ?? (isAr ? 'لا توجد سجلات مطابقة' : 'No matching records')}
                      </div>
                      <p className="mt-1 text-xs text-ink-secondary">
                        {emptyDescription ??
                          (isAr
                            ? 'جرّب تعديل كلمات البحث أو الفلاتر المطبّقة.'
                            : 'Try adjusting your search query or active filters.')}
                      </p>
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => {
                    const isSelected = selectedIds.includes(row.original.id);
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          'border-b border-border transition-colors last:border-b-0 hover:bg-subtle/60',
                          rowHeightClass,
                          isSelected && 'bg-primary-soft/40',
                        )}
                      >
                        {enableRowSelection && (
                          <td className="sticky start-0 z-10 bg-surface px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRow(row.original.id)}
                              aria-label={`Select row ${row.original.id}`}
                              className="h-3.5 w-3.5 rounded accent-primary"
                            />
                          </td>
                        )}
                        {row.getVisibleCells().map((cell, idx) => {
                          const isFirst = idx === 0 && stickyFirstColumn && !enableRowSelection;
                          const isLast =
                            idx === row.getVisibleCells().length - 1 && stickyLastColumn;
                          return (
                            <td
                              key={cell.id}
                              className={cn(
                                'whitespace-nowrap px-2.5 text-xs text-ink-primary',
                                isFirst && 'sticky start-0 z-10 bg-surface border-e border-border',
                                isLast && 'sticky end-0 z-10 bg-surface border-s border-border',
                              )}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Offset Pagination Footer */}
        {pagination && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-canvas px-4 py-2.5 text-xs text-ink-secondary">
            <div className="flex items-center gap-2">
              <span>
                {isAr
                  ? `عرض ${data.length} من إجمالي ${pagination.total.toLocaleString()} سجل`
                  : `Showing ${data.length} of ${pagination.total.toLocaleString()} records`}
              </span>
              {onPageSizeChange && (
                <select
                  aria-label="Rows per page"
                  value={pagination.limit}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className="mono-tabular rounded-control border border-border bg-surface px-2 py-1 text-xs text-ink-primary outline-none"
                >
                  {[20, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      {size} / {isAr ? 'صفحة' : 'page'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="mono-tabular">
                {isAr
                  ? `صفحة ${pagination.page} / ${pagination.totalPages}`
                  : `Page ${pagination.page} / ${pagination.totalPages}`}
              </span>
              <button
                type="button"
                disabled={!pagination.hasPreviousPage}
                onClick={() => onPageChange?.(pagination.page - 1)}
                className="flex h-7 w-7 items-center justify-center rounded-control border border-border bg-surface text-ink-primary hover:bg-subtle disabled:opacity-40"
                aria-label="Previous page"
              >
                <PrevIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={!pagination.hasNextPage}
                onClick={() => onPageChange?.(pagination.page + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-control border border-border bg-surface text-ink-primary hover:bg-subtle disabled:opacity-40"
                aria-label="Next page"
              >
                <NextIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dark Floating Bulk Action Bar */}
      {enableRowSelection && selectedIds.length > 0 && bulkActionsSlot && (
        <div className="fixed bottom-5 start-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-card border border-bulk-border bg-bulk-bg px-4 py-2.5 text-xs text-bulk-text ltr:-translate-x-1/2 rtl:translate-x-1/2">
          <span className="mono-tabular font-semibold">
            {isAr
              ? `تم تحديد ${selectedIds.length} عنصر`
              : `${selectedIds.length} selected`}
          </span>
          <span className="h-4 w-px bg-white/20" />
          <div className="flex items-center gap-2">
            {bulkActionsSlot(selectedIds, () => onSelectedIdsChange?.([]))}
          </div>
          <button
            type="button"
            onClick={() => onSelectedIdsChange?.([])}
            className="ms-1 rounded-control p-1 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
