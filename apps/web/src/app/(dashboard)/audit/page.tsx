'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  PERMISSIONS,
  type AuditLogDto,
  type CursorPaginatedResponse,
} from '@omni-ops/shared';
import { FileText, GitCompareArrows, Search, ShieldCheck, X } from 'lucide-react';
import { RoutePermissionGuard } from '@/components/rbac/permission-gate';
import { useDebounce } from '@/hooks/use-debounce';
import { useUrlTableState } from '@/hooks/use-url-table-state';
import { apiFetch } from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';

interface AuditMetaResponse {
  actions: string[];
  entityTypes: string[];
  actors: Array<{ id: string; fullName: string; email: string }>;
}

const ACTION_PILL_COLOR: Record<string, string> = {
  ORDER_STATUS_TRANSITION: '#3730A3',
  INVENTORY_TRANSFER: '#7E22CE',
  PRODUCT_PRICE_UPDATE: '#D97706',
  USER_ROLE_CHANGE: '#B91C1C',
  EXPORT_CREATED: '#0D9488',
};

function getActionPillColor(action: string): string {
  if (ACTION_PILL_COLOR[action]) return ACTION_PILL_COLOR[action]!;
  if (action.includes('ORDER')) return '#3730A3';
  if (action.includes('INVENTORY') || action.includes('TRANSFER')) return '#7E22CE';
  if (action.includes('PRODUCT')) return '#D97706';
  if (action.includes('DELETE') || action.includes('REUSE') || action.includes('ROLE')) return '#B91C1C';
  return '#0D9488';
}

function AuditLogsContent() {
  const { locale } = useUi();
  const isAr = locale === 'ar';

  const { getParam, setParams } = useUrlTableState();
  const urlQ = getParam('q', '');
  const actionFilter = getParam('action', '');
  const entityTypeFilter = getParam('entityType', '');
  const actorIdFilter = getParam('actorId', '');

  const [searchInput, setSearchInput] = useState(urlQ);
  const debouncedSearch = useDebounce(searchInput, 300);
  const [selectedDiff, setSelectedDiff] = useState<AuditLogDto | null>(null);
  const [modalDiff, setModalDiff] = useState<AuditLogDto | null>(null);

  useEffect(() => {
    if (debouncedSearch !== urlQ) setParams({ q: debouncedSearch });
  }, [debouncedSearch, urlQ, setParams]);

  const { data: meta } = useQuery({
    queryKey: ['audit-meta'],
    queryFn: () => apiFetch<AuditMetaResponse>('/audit-logs/meta'),
  });

  const auditQuery = useInfiniteQuery({
    queryKey: [
      'audit-logs',
      { q: urlQ, action: actionFilter, entityType: entityTypeFilter, actorId: actorIdFilter },
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams({ limit: '50' });
      if (pageParam) sp.set('cursor', pageParam);
      if (urlQ) sp.set('q', urlQ);
      if (actionFilter) sp.set('action', actionFilter);
      if (entityTypeFilter) sp.set('entityType', entityTypeFilter);
      if (actorIdFilter) sp.set('actorId', actorIdFilter);
      return apiFetch<CursorPaginatedResponse<AuditLogDto>>(`/audit-logs?${sp.toString()}`);
    },
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? (lastPage.meta.nextCursor ?? undefined) : undefined,
  });

  const rows = useMemo(
    () => auditQuery.data?.pages.flatMap((p) => p.data) ?? [],
    [auditQuery.data],
  );

  const activeRow = selectedDiff ?? rows[0] ?? null;

  return (
    <div className="space-y-4 text-start">
      {/* Header matching Mockup 1 */}
      <div>
        <div className="text-[11px] text-ink-secondary">
          {isAr ? 'الإدارة / سجل التدقيق' : 'Administration / Audit Logs'}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-ink-primary">
            {isAr ? 'سجل التدقيق' : 'Audit Logs'}
          </h1>
          <span
            className="mono-tabular inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-bold text-white"
            style={{ backgroundColor: '#4F5D87' }}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            APPEND-ONLY LEDGER
          </span>
        </div>
      </div>

      {/* Filters Toolbar matching Mockup 1 */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-card border border-border bg-surface p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-ink-secondary" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={
              isAr
                ? 'بحث بالعملية أو الكيان أو عنوان IP ...'
                : 'Search by action, entity, or IP address...'
            }
            className="h-9 w-full rounded-control border border-border bg-canvas pe-3 ps-9 text-xs text-ink-primary outline-none focus:border-primary"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setParams({ action: e.target.value })}
          className="h-9 rounded-control border border-border bg-canvas px-3 text-xs font-medium text-ink-primary outline-none"
        >
          <option value="">{isAr ? 'جميع العمليات' : 'All Actions'}</option>
          {(meta?.actions ?? []).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          value={entityTypeFilter}
          onChange={(e) => setParams({ entityType: e.target.value })}
          className="h-9 rounded-control border border-border bg-canvas px-3 text-xs font-medium text-ink-primary outline-none"
        >
          <option value="">{isAr ? 'جميع الكيانات' : 'All Entities'}</option>
          {(meta?.entityTypes ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={actorIdFilter}
          onChange={(e) => setParams({ actorId: e.target.value })}
          className="h-9 rounded-control border border-border bg-canvas px-3 text-xs font-medium text-ink-primary outline-none"
        >
          <option value="">{isAr ? 'جميع المستخدمين' : 'All Users'}</option>
          {(meta?.actors ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </select>
      </div>

      {/* Audit Logs Cursor Table matching Mockup 1 */}
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start text-xs">
            <thead>
              <tr className="border-b border-border bg-subtle text-ink-secondary">
                <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'الوقت' : 'Timestamp'}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'المستخدم' : 'User'}</th>
                <th className="px-4 py-2.5 text-center font-semibold">{isAr ? 'العملية' : 'Action'}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'الكيان' : 'Entity'}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'عنوان IP' : 'IP Address'}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{isAr ? 'المقارنة' : 'Compare'}</th>
              </tr>
            </thead>
            <tbody>
              {auditQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="h-[48px] border-b border-border">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4">
                        <div className="h-3.5 w-24 animate-pulse rounded bg-subtle" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-ink-secondary">
                    {isAr ? 'لا توجد سجلات تدقيق مطابقة' : 'No matching audit events'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isSelected = activeRow?.id === row.id;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedDiff(row)}
                      className={`h-[48px] cursor-pointer border-b border-border last:border-b-0 transition-colors ${
                        isSelected ? 'bg-primary-soft/50' : 'hover:bg-subtle/50'
                      }`}
                    >
                      <td dir="ltr" className="mono-tabular whitespace-nowrap px-4 font-medium text-ink-primary">
                        {new Date(row.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="whitespace-nowrap px-4 font-semibold text-ink-primary">
                        {row.actorName}
                      </td>
                      <td className="whitespace-nowrap px-4 text-center">
                        <span
                          dir="ltr"
                          className="mono-tabular inline-flex items-center rounded-pill px-3.5 py-1 text-[11px] font-bold text-white"
                          style={{ backgroundColor: getActionPillColor(row.action) }}
                        >
                          {row.action}
                        </span>
                      </td>
                      <td dir="ltr" className="mono-tabular whitespace-nowrap px-4 font-semibold text-ink-primary">
                        {row.entityId}
                      </td>
                      <td dir="ltr" className="mono-tabular whitespace-nowrap px-4 text-ink-primary">
                        {row.ipAddress ?? '127.0.0.1'}
                      </td>
                      <td className="whitespace-nowrap px-4 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            title={isAr ? 'عرض التغييرات أسفل الجدول' : 'Show inline diff'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDiff(row);
                            }}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-control border transition-colors ${
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-canvas text-ink-secondary hover:bg-subtle hover:text-ink-primary'
                            }`}
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title={isAr ? 'فتح نافذة المقارنة (Diff Modal)' : 'Open Diff Modal'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDiff(row);
                              setModalDiff(row);
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border bg-canvas text-ink-secondary hover:bg-subtle hover:text-ink-primary"
                          >
                            <GitCompareArrows className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inline Side-by-Side Before / After Diff Card matching Mockup 1 */}
      {activeRow && (
        <section className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-bold text-ink-primary">
              {isAr
                ? `مقارنة التغييرات (Before / After) - ${activeRow.entityId}`
                : `State Changes Comparison (Before / After) - ${activeRow.entityId}`}
            </h2>
          </div>

          <div className="grid divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0 md:divide-x-reverse">
            {/* Before Column */}
            <div className="p-4">
              <div className="mb-2 text-xs font-bold text-ink-secondary">
                {isAr ? 'قبل (Before)' : 'Before'}
              </div>
              <pre
                dir="ltr"
                className="mono-tabular overflow-x-auto rounded-control border p-3 text-left text-xs leading-relaxed text-ink-primary"
                style={{
                  backgroundColor: 'var(--diff-before-bg)',
                  borderColor: 'var(--diff-before-border)',
                }}
              >
                {activeRow.beforeState
                  ? JSON.stringify(activeRow.beforeState, null, 2)
                  : '{\n  "state": null\n}'}
              </pre>
            </div>

            {/* After Column */}
            <div className="p-4">
              <div className="mb-2 text-xs font-bold text-ink-secondary">
                {isAr ? 'بعد (After)' : 'After'}
              </div>
              <pre
                dir="ltr"
                className="mono-tabular overflow-x-auto rounded-control border p-3 text-left text-xs leading-relaxed text-ink-primary"
                style={{
                  backgroundColor: 'var(--diff-after-bg)',
                  borderColor: 'var(--diff-after-border)',
                }}
              >
                {activeRow.afterState
                  ? JSON.stringify(activeRow.afterState, null, 2)
                  : '{\n  "state": null\n}'}
              </pre>
            </div>
          </div>
        </section>
      )}

      {/* Full Modal Diff View */}
      {modalDiff && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setModalDiff(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-3xl rounded-card border border-border bg-surface p-5 text-start"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-ink-primary">
                  {isAr
                    ? `مقارنة التغييرات (Before / After) - ${modalDiff.entityId}`
                    : `Audit State Diff - ${modalDiff.entityId}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalDiff(null)}
                className="rounded-control p-1 text-ink-secondary hover:bg-subtle hover:text-ink-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div
                className="rounded-card border p-3.5"
                style={{
                  backgroundColor: 'var(--diff-before-bg)',
                  borderColor: 'var(--diff-before-border)',
                }}
              >
                <div className="mb-2 text-xs font-bold" style={{ color: 'var(--status-rose-text)' }}>
                  {isAr ? 'قبل (Before)' : 'Before'}
                </div>
                <pre
                  dir="ltr"
                  className="mono-tabular max-h-80 overflow-auto whitespace-pre-wrap text-left text-xs text-ink-primary"
                >
                  {modalDiff.beforeState
                    ? JSON.stringify(modalDiff.beforeState, null, 2)
                    : '// null'}
                </pre>
              </div>

              <div
                className="rounded-card border p-3.5"
                style={{
                  backgroundColor: 'var(--diff-after-bg)',
                  borderColor: 'var(--diff-after-border)',
                }}
              >
                <div className="mb-2 text-xs font-bold" style={{ color: 'var(--status-emerald-text)' }}>
                  {isAr ? 'بعد (After)' : 'After'}
                </div>
                <pre
                  dir="ltr"
                  className="mono-tabular max-h-80 overflow-auto whitespace-pre-wrap text-left text-xs text-ink-primary"
                >
                  {modalDiff.afterState
                    ? JSON.stringify(modalDiff.afterState, null, 2)
                    : '// null'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditPage() {
  return (
    <RoutePermissionGuard permission={PERMISSIONS.AUDIT_READ}>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-card bg-subtle" />}>
        <AuditLogsContent />
      </Suspense>
    </RoutePermissionGuard>
  );
}
