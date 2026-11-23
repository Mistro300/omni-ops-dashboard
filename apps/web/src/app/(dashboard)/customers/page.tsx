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
        cell: ({ row }) => <span className="font-semibold text-ink-primary">{row.original.name}</span>,
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

  return (
    <div className="space-y-4 text-start">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-primary">
            {isAr ? 'دليل العملاء (Customers Directory)' : 'Customers Directory'}
          </h1>
          <p className="mt-0.5 text-xs text-ink-secondary">
            {isAr
              ? 'إدارة حسابات العملاء مع ملخص عدد الطلبات وإجمالي الإنفاق.'
              : 'Manage customer accounts with aggregated order counts and total spend.'}
          </p>
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
