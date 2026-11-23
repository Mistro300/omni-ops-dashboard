'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  PERMISSIONS,
  type AuditLogDto,
  type CursorPaginatedResponse,
} from '@omni-ops/shared';
import { FileClock, GitCompareArrows, Search, X } from 'lucide-react';
import { RoutePermissionGuard } from '@/components/rbac/permission-gate';
import { useDebounce } from '@/hooks/use-debounce';
import { useUrlTableState } from '@/hooks/use-url-table-state';
import { apiFetch } from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';
import { getBadgeTokenStyles, ROLE_BADGE_TONE } from '@/styles/status-badges';

interface AuditMetaResponse {
  actions: string[];
  entityTypes: string[];
  actors: Array<{ id: string; fullName: string; email: string }>;
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

  return (
    <div className="space-y-4 text-start">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileClock className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-ink-primary">
              {isAr ? 'سجل التدقيق غير القابل للتعديل (Audit Logs)' : 'Immutable Audit Logs'}
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-ink-secondary">
            {isAr
              ? 'سجل محمي بـ PostgreSQL Append-Only Trigger يعرض مقارنة Before / After لكل عملية حساسة.'
              : 'Protected by PostgreSQL Append-Only Trigger with Side-by-Side Before/After state diffs.'}
          </p>
        </div>
        <span className="status-pill" style={getBadgeTokenStyles('indigo').pill}>
          <span className="status-dot" style={getBadgeTokenStyles('indigo').dot} />
          APPEND-ONLY LEDGER
        </span>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute start-2.5 top-2.5 h-4 w-4 text-ink-secondary" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={isAr ? 'بحث بالعملية أو الكيان أو IP...' : 'Search action, entity ID, IP...'}
            className="w-full rounded-control border border-border bg-canvas py-1.5 pe-3 ps-8 text-xs text-ink-primary outline-none focus:border-primary"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setParams({ action: e.target.value })}
          className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none"
        >
          <option value="">{isAr ? 'كل العمليات' : 'All Actions'}</option>
          {(meta?.actions ?? []).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          value={entityTypeFilter}
          onChange={(e) => setParams({ entityType: e.target.value })}
          className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none"
        >
          <option value="">{isAr ? 'كل الكيانات' : 'All Entities'}</option>
          {(meta?.entityTypes ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={actorIdFilter}
          onChange={(e) => setParams({ actorId: e.target.value })}
          className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none"
        >
          <option value="">{isAr ? 'كل المستخدمين' : 'All Actors'}</option>
          {(meta?.actors ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </select>
      </div>

      {/* Audit Logs Cursor Table */}
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start text-xs">
            <thead>
              <tr className="border-b border-border bg-subtle text-ink-secondary">
                <th className="px-3 py-2.5 text-start font-semibold">{isAr ? 'الوقت' : 'Timestamp'}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{isAr ? 'المستخدم' : 'Actor'}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{isAr ? 'العملية' : 'Action'}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{isAr ? 'الكيان' : 'Entity'}</th>
                <th className="px-3 py-2.5 text-start font-semibold">IP</th>
                <th className="px-3 py-2.5 text-end font-semibold">{isAr ? 'المقارنة' : 'Diff'}</th>
              </tr>
            </thead>
            <tbody>
              {auditQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="h-[44px] border-b border-border">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-3">
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
                  const roleSt = getBadgeTokenStyles(ROLE_BADGE_TONE[row.actorRole]);
                  return (
                    <tr
                      key={row.id}
                      className="h-[44px] border-b border-border last:border-b-0 hover:bg-subtle/50"
                    >
                      <td dir="ltr" className="mono-tabular whitespace-nowrap px-3 text-ink-secondary">
                        {new Date(row.createdAt).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink-primary">{row.actorName}</span>
                          <span className="status-pill" style={roleSt.pill}>
                            <span className="status-dot" style={roleSt.dot} />
                            {row.actorRole}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3">
                        <span
                          dir="ltr"
                          className="mono-tabular inline-block rounded-control border border-border bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-primary"
                        >
                          {row.action}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3">
                        <span className="font-medium text-ink-primary">{row.entityType}</span>{' '}
                        <span dir="ltr" className="mono-tabular inline-block text-[11px] text-ink-secondary">
                          ({row.entityId.slice(0, 12)})
                        </span>
                      </td>
                      <td dir="ltr" className="mono-tabular whitespace-nowrap px-3 text-ink-secondary">
                        {row.ipAddress ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 text-end">
                        <button
                          type="button"
                          onClick={() => setSelectedDiff(row)}
                          className="inline-flex items-center gap-1 rounded-control border border-border bg-canvas px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-subtle"
                        >
                          <GitCompareArrows className="h-3.5 w-3.5" />
                          {isAr ? 'مقارنة Diff' : 'View Diff'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {auditQuery.hasNextPage && (
          <div className="border-t border-border bg-canvas p-3 text-center">
            <button
              type="button"
              disabled={auditQuery.isFetchingNextPage}
              onClick={() => void auditQuery.fetchNextPage()}
              className="rounded-control border border-border bg-surface px-4 py-1.5 text-xs font-medium text-ink-primary hover:bg-subtle disabled:opacity-50"
            >
              {auditQuery.isFetchingNextPage
                ? isAr
                  ? 'جارٍ التحميل...'
                  : 'Loading...'
                : isAr
                  ? 'تحميل سجلات أقدم'
                  : 'Load Older Audit Logs'}
            </button>
          </div>
        )}
      </div>

      {/* Side-by-Side Before / After Audit Diff Modal (JetBrains Mono + Rose/Emerald Tints) */}
      {selectedDiff && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedDiff(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-3xl rounded-card border border-border bg-surface p-5 text-start"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <GitCompareArrows className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold text-ink-primary">
                    {isAr ? 'مقارنة حالة التدقيق (Before / After Diff)' : 'Audit State Diff'}
                  </h3>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
                  <span dir="ltr" className="mono-tabular font-semibold text-ink-primary">
                    {selectedDiff.action}
                  </span>
                  <span>•</span>
                  <span>
                    {selectedDiff.entityType} ({selectedDiff.entityId})
                  </span>
                  <span>•</span>
                  <span dir="ltr" className="mono-tabular">
                    IP: {selectedDiff.ipAddress ?? '—'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDiff(null)}
                className="rounded-control p-1 text-ink-secondary hover:bg-subtle hover:text-ink-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Side-by-Side Diff Panels */}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div
                className="rounded-card border p-3.5"
                style={{
                  backgroundColor: 'var(--diff-before-bg)',
                  borderColor: 'var(--diff-before-border)',
                }}
              >
                <div
                  className="mb-2 text-xs font-bold"
                  style={{ color: 'var(--status-rose-text)' }}
                >
                  {isAr ? 'الحالة السابقة (Before State)' : 'Before State'}
                </div>
                <pre
                  dir="ltr"
                  className="mono-tabular max-h-80 overflow-auto whitespace-pre-wrap text-left text-xs text-ink-primary"
                >
                  {selectedDiff.beforeState
                    ? JSON.stringify(selectedDiff.beforeState, null, 2)
                    : '// null (new entity / no prior snapshot)'}
                </pre>
              </div>

              <div
                className="rounded-card border p-3.5"
                style={{
                  backgroundColor: 'var(--diff-after-bg)',
                  borderColor: 'var(--diff-after-border)',
                }}
              >
                <div
                  className="mb-2 text-xs font-bold"
                  style={{ color: 'var(--status-emerald-text)' }}
                >
                  {isAr ? 'الحالة الجديدة (After State)' : 'After State'}
                </div>
                <pre
                  dir="ltr"
                  className="mono-tabular max-h-80 overflow-auto whitespace-pre-wrap text-left text-xs text-ink-primary"
                >
                  {selectedDiff.afterState
                    ? JSON.stringify(selectedDiff.afterState, null, 2)
                    : '// null'}
                </pre>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDiff(null)}
                className="rounded-control border border-border bg-canvas px-4 py-1.5 text-xs font-medium text-ink-primary hover:bg-subtle"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
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
