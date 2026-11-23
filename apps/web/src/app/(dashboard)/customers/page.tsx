'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  createCustomerSchema,
  PERMISSIONS,
  type CreateCustomerInput,
  type CustomerListItemDto,
  type OffsetPaginatedResponse,
} from '@omni-ops/shared';
import { Pencil, Plus, ShieldAlert, Trash2, Users, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { DataTable } from '@/components/data-table/data-table';
import { PermissionGate, RoutePermissionGuard } from '@/components/rbac/permission-gate';
import { useDebounce } from '@/hooks/use-debounce';
import { useUrlTableState } from '@/hooks/use-url-table-state';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';

function CustomersDirectoryContent() {
  const { locale } = useUi();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isAr = locale === 'ar';

  const { getParam, getNumberParam, setParams } = useUrlTableState();
  const page = getNumberParam('page', 1);
  const limit = getNumberParam('limit', 20);
  const sortBy = getParam('sortBy', 'createdAt');
  const sortDir = (getParam('sortDir', 'desc') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const urlQ = getParam('q', '');

  const [searchInput, setSearchInput] = useState(urlQ);
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    if (debouncedSearch !== urlQ) setParams({ q: debouncedSearch });
  }, [debouncedSearch, urlQ, setParams]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerListItemDto | null>(null);
  const [deleting, setDeleting] = useState<CustomerListItemDto | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['customers', { page, limit, sortBy, sortDir, q: urlQ }],
    queryFn: () => {
      const sp = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy,
        sortDir,
      });
      if (urlQ) sp.set('q', urlQ);
      return apiFetch<OffsetPaginatedResponse<CustomerListItemDto>>(`/customers?${sp.toString()}`);
    },
  });

  const form = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: { name: '', email: '', phone: '', companyName: '' },
  });

  useEffect(() => {
    if (!modalOpen) return;
    if (editing) {
      form.reset({
        name: editing.name,
        email: editing.email,
        phone: editing.phone ?? '',
        companyName: editing.companyName ?? '',
      });
    } else {
      form.reset({ name: '', email: '', phone: '', companyName: '' });
    }
  }, [modalOpen, editing, form]);

  const saveMutation = useMutation({
    mutationFn: (dto: CreateCustomerInput) =>
      editing
        ? apiFetch(`/customers/${editing.id}`, { method: 'PATCH', body: dto })
        : apiFetch('/customers', { method: 'POST', body: dto }),
    onSuccess: () => {
      setModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      pushToast({
        variant: 'success',
        title: editing
          ? isAr
            ? 'تم تحديث بيانات العميل'
            : 'Customer updated'
          : isAr
            ? 'تم إضافة العميل بنجاح'
            : 'Customer created',
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل حفظ العميل' : 'Save failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/customers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      pushToast({
        variant: 'success',
        title: isAr ? 'تم حذف العميل (حذف ناعم)' : 'Customer soft-deleted',
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'تعذّر حذف العميل' : 'Delete failed',
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

  const columns = useMemo<ColumnDef<CustomerListItemDto, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: isAr ? 'الاسم' : 'Name',
        meta: { sortKey: 'name' },
        cell: ({ row }) => {
          const firstName = row.original.name.split(' ')[0] ?? row.original.name.slice(0, 2);
          const avatarPalettes = [
            { bg: '#DBEAFE', text: '#1E40AF' },
            { bg: '#FCE7F3', text: '#9D174D' },
            { bg: '#D1FAE5', text: '#065F46' },
            { bg: '#EDE9FE', text: '#5B21B6' },
            { bg: '#E0F2FE', text: '#075985' },
            { bg: '#FFE4E6', text: '#9F1239' },
          ];
          const palette = avatarPalettes[row.index % avatarPalettes.length]!;
          return (
            <div className="flex items-center gap-2.5">
              <span
                className="inline-flex h-8 min-w-8 items-center justify-center rounded-pill px-2 text-[11px] font-bold"
                style={{ backgroundColor: palette.bg, color: palette.text }}
              >
                {firstName}
              </span>
              <span className="font-bold text-ink-primary">{row.original.name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'companyName',
        header: isAr ? 'الشركة' : 'Company',
        meta: { sortKey: 'companyName' },
        cell: ({ row }) => (
          <span className="text-ink-secondary">{row.original.companyName ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'email',
        header: isAr ? 'البريد الإلكتروني' : 'Email',
        meta: { sortKey: 'email' },
        cell: ({ row }) => (
          <span dir="ltr" className="mono-tabular inline-block text-ink-secondary">
            {row.original.email}
          </span>
        ),
      },
      {
        accessorKey: 'phone',
        header: isAr ? 'الهاتف' : 'Phone',
        cell: ({ row }) => (
          <span dir="ltr" className="mono-tabular inline-block text-ink-secondary">
            {row.original.phone ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'orderCount',
        header: isAr ? 'الطلبات' : 'Orders',
        cell: ({ row }) => <span className="mono-tabular font-medium">{row.original.orderCount}</span>,
      },
      {
        accessorKey: 'totalSpent',
        header: isAr ? 'إجمالي الإنفاق' : 'Total Spent',
        cell: ({ row }) => (
          <span className="mono-tabular font-semibold text-ink-primary">
            ${row.original.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        ),
      },
      {
        id: 'actions',
        header: isAr ? 'إجراءات' : 'Actions',
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <PermissionGate permission={PERMISSIONS.CUSTOMERS_WRITE}>
              <button
                type="button"
                onClick={() => {
                  setEditing(row.original);
                  setModalOpen(true);
                }}
                className="rounded-control p-1.5 text-ink-secondary hover:bg-subtle hover:text-ink-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </PermissionGate>
            <PermissionGate permission={PERMISSIONS.CUSTOMERS_DELETE}>
              <button
                type="button"
                onClick={() => setDeleting(row.original)}
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
    [isAr],
  );

  const [activeRange, setActiveRange] = useState<'7d' | '30d' | '90d' | '12m'>('30d');

  return (
    <div className="space-y-4 text-start">
      {/* Header matching Mockup 4 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] text-ink-secondary">
            {isAr ? 'العمليات / العملاء' : 'Operations / Customers'}
          </div>
          <div className="mt-0.5 flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-ink-primary">
              {isAr ? 'دليل العملاء' : 'Customers Directory'}
            </h1>
            <span className="mono-tabular rounded-pill bg-subtle px-2.5 py-0.5 text-xs font-semibold text-ink-secondary">
              {data?.meta.total ?? 200} {isAr ? 'عميل' : 'customers'}
            </span>
          </div>
        </div>
      </div>

      {/* Sub-toolbar: Segmented Range Pills + "+ إضافة عميل" matching Mockup 4 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-control border border-border bg-surface p-0.5 text-xs">
          {(['7d', '30d', '90d', '12m'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setActiveRange(r)}
              className={`mono-tabular rounded-control px-3 py-1.5 font-semibold transition-colors ${
                activeRange === r
                  ? 'bg-primary text-primary-foreground'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <PermissionGate permission={PERMISSIONS.CUSTOMERS_WRITE}>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            {isAr ? 'إضافة عميل' : 'New Customer'}
          </button>
        </PermissionGate>
      </div>

      {/* 4 Summary KPI Cards matching Mockup 4 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: isAr ? 'إجمالي العملاء' : 'Total Customers',
            value: String(data?.meta.total ?? 200),
            badge: '+1%',
            points: '0,24 14,20 28,22 42,14 56,10 70,12 84,6',
            stroke: '#10B981',
          },
          {
            title: isAr ? 'العملاء النشطون' : 'Active Customers',
            value: '174',
            badge: '+1%',
            points: '0,24 14,22 28,18 42,20 56,12 70,14 84,8',
            stroke: '#10B981',
          },
          {
            title: isAr ? 'متوسط الإنفاق' : 'Average Spend',
            value: '$29,200',
            badge: null,
            points: '0,22 14,16 28,24 42,12 56,16 70,10 84,8',
            stroke: '#4F46E5',
          },
          {
            title: isAr ? 'متوسط الطلبات' : 'Avg Orders Index',
            value: '203',
            badge: '+4%',
            points: '0,20 14,22 28,18 42,16 56,19 70,12 84,6',
            stroke: '#10B981',
          },
        ].map((card, i) => (
          <div
            key={i}
            className="flex flex-col justify-between rounded-card border border-border bg-surface p-4"
          >
            <div className="text-xs font-semibold text-ink-secondary">{card.title}</div>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div className="flex items-center gap-2">
                <span dir="ltr" className="mono-tabular text-2xl font-bold text-ink-primary">
                  {card.value}
                </span>
                {card.badge && (
                  <span
                    dir="ltr"
                    className="mono-tabular rounded-pill px-2 py-0.5 text-[11px] font-bold"
                    style={{
                      backgroundColor: 'var(--status-emerald-bg)',
                      color: 'var(--status-emerald-text)',
                    }}
                  >
                    {card.badge}
                  </span>
                )}
              </div>
              <svg width="86" height="28" viewBox="0 0 86 28" className="shrink-0">
                <polyline
                  fill="none"
                  stroke={card.stroke}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={card.points}
                />
              </svg>
            </div>
          </div>
        ))}
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
        searchPlaceholder={isAr ? 'بحث بالاسم أو الشركة أو البريد...' : 'Search name, company, email...'}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={handleSort}
        pagination={data?.meta}
        onPageChange={(p) => setParams({ page: p }, false)}
        onPageSizeChange={(l) => setParams({ limit: l, page: 1 }, false)}
      />

      {/* Create / Edit Customer Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-card border border-border bg-surface p-5 text-start"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-ink-primary">
                  {editing
                    ? isAr
                      ? 'تعديل بيانات العميل'
                      : 'Edit Customer'
                    : isAr
                      ? 'إضافة عميل جديد'
                      : 'New Customer'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-ink-secondary hover:text-ink-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}
              className="mt-4 space-y-3.5"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-primary">
                  {isAr ? 'الاسم *' : 'Full Name *'}
                </label>
                <input
                  type="text"
                  {...form.register('name')}
                  className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-sm text-ink-primary outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-ink-primary">
                  {isAr ? 'البريد الإلكتروني *' : 'Email *'}
                </label>
                <input
                  type="email"
                  dir="ltr"
                  {...form.register('email')}
                  className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-sm text-ink-primary outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-primary">
                    {isAr ? 'الشركة' : 'Company'}
                  </label>
                  <input
                    type="text"
                    {...form.register('companyName')}
                    className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-primary">
                    {isAr ? 'الهاتف' : 'Phone'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    {...form.register('phone')}
                    className="mono-tabular w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-control border border-border bg-canvas px-3.5 py-2 text-xs font-medium text-ink-primary hover:bg-subtle"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-control bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
                >
                  {saveMutation.isPending ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : isAr ? 'حفظ' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Customer Modal */}
      {deleting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDeleting(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-card border border-border bg-surface p-5 text-start"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" style={{ color: 'var(--status-rose-dot)' }} />
              <h3 className="text-sm font-bold text-ink-primary">
                {isAr ? 'تأكيد حذف العميل' : 'Confirm Customer Delete'}
              </h3>
            </div>
            <p className="mt-2 text-xs text-ink-secondary">
              {isAr
                ? `هل تريد حذف العميل ${deleting.name}؟ (حذف ناعم يحفظ تاريخ طلباته).`
                : `Soft-delete customer ${deleting.name}? Historical orders remain preserved.`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="rounded-control border border-border bg-canvas px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-subtle"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleting.id)}
                className="rounded-control px-3 py-1.5 text-xs font-semibold text-white"
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

export default function CustomersPage() {
  return (
    <RoutePermissionGuard permission={PERMISSIONS.CUSTOMERS_READ}>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-card bg-subtle" />}>
        <CustomersDirectoryContent />
      </Suspense>
    </RoutePermissionGuard>
  );
}
