'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  createUserSchema,
  PERMISSIONS,
  ROLES,
  type CreateUserInput,
  type OffsetPaginatedResponse,
  type Permission,
  type UserListItemDto,
  type UserRole,
} from '@omni-ops/shared';
import { LogOut, Pencil, Plus, ShieldCheck, Users, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { DataTable } from '@/components/data-table/data-table';
import { RoutePermissionGuard } from '@/components/rbac/permission-gate';
import { useDebounce } from '@/hooks/use-debounce';
import { useUrlTableState } from '@/hooks/use-url-table-state';
import { apiFetch, ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useAuth, useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';
import { getBadgeTokenStyles, ROLE_BADGE_TONE } from '@/styles/status-badges';

interface RbacMatrixResponse {
  matrix: Record<UserRole, readonly Permission[]>;
}

function UsersManagementContent() {
  const { locale } = useUi();
  const { user: currentUser } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isAr = locale === 'ar';

  const { getParam, getNumberParam, setParams } = useUrlTableState();
  const tab = getParam('tab', 'users');
  const page = getNumberParam('page', 1);
  const limit = getNumberParam('limit', 20);
  const sortBy = getParam('sortBy', 'createdAt');
  const sortDir = (getParam('sortDir', 'desc') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const urlQ = getParam('q', '');
  const roleFilter = getParam('role', '');
  const statusFilter = getParam('status', '');

  const [searchInput, setSearchInput] = useState(urlQ);
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    if (debouncedSearch !== urlQ) setParams({ q: debouncedSearch });
  }, [debouncedSearch, urlQ, setParams]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItemDto | null>(null);
  const [editRole, setEditRole] = useState<UserRole>(ROLES.VIEWER);
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');

  const usersQuery = useQuery({
    queryKey: ['admin-users', { page, limit, sortBy, sortDir, q: urlQ, role: roleFilter, status: statusFilter }],
    enabled: tab === 'users',
    queryFn: () => {
      const sp = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy,
        sortDir,
      });
      if (urlQ) sp.set('q', urlQ);
      if (roleFilter) sp.set('role', roleFilter);
      if (statusFilter) sp.set('status', statusFilter);
      return apiFetch<OffsetPaginatedResponse<UserListItemDto>>(`/users?${sp.toString()}`);
    },
  });

  const matrixQuery = useQuery({
    queryKey: ['rbac-matrix'],
    enabled: tab === 'matrix',
    queryFn: () => apiFetch<RbacMatrixResponse>('/auth/rbac-matrix'),
  });

  const createForm = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', fullName: '', role: ROLES.EDITOR, password: '' },
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreateUserInput) => apiFetch('/users', { method: 'POST', body: dto }),
    onSuccess: () => {
      setCreateOpen(false);
      createForm.reset();
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      pushToast({
        variant: 'success',
        title: isAr ? 'تم إنشاء حساب المستخدم بنجاح' : 'User created successfully',
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل إنشاء المستخدم' : 'Failed to create user',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, role, status }: { id: string; role: UserRole; status: 'ACTIVE' | 'SUSPENDED' }) =>
      apiFetch(`/users/${id}`, { method: 'PATCH', body: { role, status } }),
    onSuccess: () => {
      setEditingUser(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      pushToast({
        variant: 'success',
        title: isAr ? 'تم تحديث صلاحيات المستخدم' : 'User updated',
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل التحديث' : 'Update failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ revokedCount: number }>(`/users/${id}/revoke-sessions`, { method: 'POST' }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      pushToast({
        variant: 'success',
        title: isAr ? 'تم إنهاء جلسات المستخدم' : 'User sessions revoked',
        description: `${res.revokedCount} session(s) terminated`,
      });
    },
  });

  const columns = useMemo<ColumnDef<UserListItemDto, unknown>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: isAr ? 'الاسم' : 'Full Name',
        meta: { sortKey: 'fullName' },
        cell: ({ row }) => (
          <span className="font-semibold text-ink-primary">{row.original.fullName}</span>
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
        accessorKey: 'role',
        header: isAr ? 'الدور' : 'Role',
        meta: { sortKey: 'role' },
        cell: ({ row }) => {
          const st = getBadgeTokenStyles(ROLE_BADGE_TONE[row.original.role]);
          return (
            <span className="status-pill" style={st.pill}>
              <span className="status-dot" style={st.dot} />
              {row.original.role}
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: isAr ? 'الحالة' : 'Status',
        meta: { sortKey: 'status' },
        cell: ({ row }) => {
          const st = getBadgeTokenStyles(row.original.status === 'ACTIVE' ? 'emerald' : 'rose');
          return (
            <span className="status-pill" style={st.pill}>
              <span className="status-dot" style={st.dot} />
              {row.original.status}
            </span>
          );
        },
      },
      {
        accessorKey: 'activeSessionsCount',
        header: isAr ? 'الجلسات' : 'Sessions',
        cell: ({ row }) => <span className="mono-tabular">{row.original.activeSessionsCount}</span>,
      },
      {
        accessorKey: 'lastLoginAt',
        header: isAr ? 'آخر دخول' : 'Last Login',
        meta: { sortKey: 'lastLoginAt' },
        cell: ({ row }) => (
          <span dir="ltr" className="mono-tabular text-ink-secondary">
            {row.original.lastLoginAt ? new Date(row.original.lastLoginAt).toLocaleString() : '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: isAr ? 'إجراءات' : 'Actions',
        enableHiding: false,
        cell: ({ row }) => {
          const isSelf = row.original.id === currentUser?.id;
          return (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={isSelf}
                title={isSelf ? (isAr ? 'لا يمكنك تعديل دورك بنفسك' : 'Cannot edit own role') : isAr ? 'تعديل الدور/الحالة' : 'Edit role/status'}
                onClick={() => {
                  setEditingUser(row.original);
                  setEditRole(row.original.role);
                  setEditStatus(row.original.status);
                }}
                className="rounded-control p-1.5 text-ink-secondary hover:bg-subtle hover:text-ink-primary disabled:opacity-30"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={isAr ? 'إنهاء جميع جلسات المستخدم' : 'Revoke all sessions'}
                disabled={row.original.activeSessionsCount === 0}
                onClick={() => revokeMutation.mutate(row.original.id)}
                className="rounded-control p-1.5 hover:bg-subtle disabled:opacity-30"
                style={{ color: 'var(--status-rose-text)' }}
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        },
      },
    ],
    [isAr, currentUser?.id, revokeMutation],
  );

  const allPermissions = Object.values(PERMISSIONS);
  const roles: UserRole[] = [ROLES.ADMIN, ROLES.EDITOR, ROLES.VIEWER];

  return (
    <div className="space-y-5 text-start">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-primary">
            {isAr ? 'المستخدمون والصلاحيات (Users & RBAC)' : 'Users & RBAC Administration'}
          </h1>
          <p className="mt-0.5 text-xs text-ink-secondary">
            {isAr
              ? 'إدارة حسابات الفريق، تعيين الأدوار، تعليق الحسابات، وإنهاء الجلسات النشطة.'
              : 'Manage team accounts, assign roles, suspend accounts, and revoke active sessions.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-control border border-border bg-surface p-1 text-xs">
            <button
              type="button"
              onClick={() => setParams({ tab: 'users', page: 1 }, false)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 font-medium',
                tab === 'users' ? 'bg-primary text-primary-foreground' : 'text-ink-secondary',
              )}
            >
              <Users className="h-3.5 w-3.5" />
              {isAr ? 'المستخدمون' : 'Users'}
            </button>
            <button
              type="button"
              onClick={() => setParams({ tab: 'matrix' }, false)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 font-medium',
                tab === 'matrix' ? 'bg-primary text-primary-foreground' : 'text-ink-secondary',
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {isAr ? 'مصفوفة الصلاحيات' : 'RBAC Matrix'}
            </button>
          </div>

          {tab === 'users' && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" />
              {isAr ? 'إضافة مستخدم' : 'Add User'}
            </button>
          )}
        </div>
      </div>

      {tab === 'users' ? (
        <DataTable
          columns={columns}
          data={usersQuery.data?.data ?? []}
          isLoading={usersQuery.isLoading}
          isFetching={usersQuery.isFetching}
          error={usersQuery.error instanceof Error ? usersQuery.error.message : null}
          onRetry={() => void usersQuery.refetch()}
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder={isAr ? 'بحث بالاسم أو البريد...' : 'Search name or email...'}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={(f) =>
            setParams({ sortBy: f, sortDir: sortBy === f && sortDir === 'asc' ? 'desc' : 'asc' }, false)
          }
          pagination={usersQuery.data?.meta}
          onPageChange={(p) => setParams({ page: p }, false)}
          onPageSizeChange={(l) => setParams({ limit: l, page: 1 }, false)}
          filtersSlot={
            <>
              <select
                value={roleFilter}
                onChange={(e) => setParams({ role: e.target.value })}
                className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none"
              >
                <option value="">{isAr ? 'كل الأدوار' : 'All Roles'}</option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setParams({ status: e.target.value })}
                className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none"
              >
                <option value="">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-subtle text-xs text-ink-secondary">
                <th className="px-4 py-2.5 text-start font-semibold">Permission</th>
                {roles.map((r) => {
                  const st = getBadgeTokenStyles(ROLE_BADGE_TONE[r]);
                  return (
                    <th key={r} className="px-4 py-2.5 text-center font-semibold">
                      <span className="status-pill" style={st.pill}>
                        <span className="status-dot" style={st.dot} />
                        {r}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {allPermissions.map((perm) => (
                <tr key={perm} className="h-[40px] border-b border-border last:border-b-0">
                  <td className="mono-tabular px-4 py-2 text-xs text-ink-primary">{perm}</td>
                  {roles.map((r) => {
                    const granted = matrixQuery.data?.matrix[r]?.includes(perm) ?? false;
                    return (
                      <td key={r} className="px-4 py-2 text-center text-xs font-medium">
                        {granted ? (
                          <span style={{ color: 'var(--status-emerald-text)' }}>✓</span>
                        ) : (
                          <span className="text-ink-secondary">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCreateOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-card border border-border bg-surface p-5 text-start"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-ink-primary">
                {isAr ? 'إضافة مستخدم جديد' : 'Create User Account'}
              </h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="text-ink-secondary hover:text-ink-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={createForm.handleSubmit((v) => createMutation.mutate(v))}
              className="mt-4 space-y-3.5"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-primary">
                  {isAr ? 'الاسم الكامل *' : 'Full Name *'}
                </label>
                <input
                  type="text"
                  {...createForm.register('fullName')}
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
                  {...createForm.register('email')}
                  className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-sm text-ink-primary outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-primary">
                    {isAr ? 'الدور *' : 'Role *'}
                  </label>
                  <select
                    {...createForm.register('role')}
                    className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-primary">
                    {isAr ? 'كلمة المرور المبدئية *' : 'Initial Password *'}
                  </label>
                  <input
                    type="password"
                    dir="ltr"
                    placeholder="StrongPass123"
                    {...createForm.register('password')}
                    className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
                  />
                </div>
              </div>
              {createForm.formState.errors.password && (
                <p className="text-xs" style={{ color: 'var(--status-rose-text)' }}>
                  {createForm.formState.errors.password.message}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-control border border-border bg-canvas px-3.5 py-2 text-xs font-medium text-ink-primary hover:bg-subtle"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-control bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
                >
                  {createMutation.isPending ? (isAr ? 'جارٍ الإنشاء...' : 'Creating...') : isAr ? 'إنشاء' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role / Status Modal */}
      {editingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setEditingUser(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-card border border-border bg-surface p-5 text-start"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-ink-primary">
              {isAr ? 'تعديل دور وحالة المستخدم' : 'Update User Role & Status'}
            </h3>
            <p className="mt-1 text-xs text-ink-secondary">
              {editingUser.fullName} (<span dir="ltr" className="mono-tabular">{editingUser.email}</span>)
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-primary">
                  {isAr ? 'الدور' : 'Role'}
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none"
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-primary">
                  {isAr ? 'الحالة' : 'Status'}
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'ACTIVE' | 'SUSPENDED')}
                  className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-control border border-border bg-canvas px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-subtle"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={updateMutation.isPending}
                onClick={() =>
                  updateMutation.mutate({
                    id: editingUser.id,
                    role: editRole,
                    status: editStatus,
                  })
                }
                className="rounded-control bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                {isAr ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UsersPage() {
  return (
    <RoutePermissionGuard permission={PERMISSIONS.USERS_MANAGE}>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-card bg-subtle" />}>
        <UsersManagementContent />
      </Suspense>
    </RoutePermissionGuard>
  );
}
