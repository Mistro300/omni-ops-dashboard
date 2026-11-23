'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EXPORT_REPORT_TYPES,
  EXPORT_STATUSES,
  PERMISSIONS,
  type ExportJobDto,
  type ExportReportType,
  type ExportStatus,
  type OffsetPaginatedResponse,
} from '@omni-ops/shared';
import {
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { PermissionGate } from '@/components/rbac/permission-gate';
import {
  ApiError,
  apiFetch,
  apiFetchExportOrBlob,
  triggerBlobDownload,
} from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';
import { getBadgeTokenStyles, type BadgeTone } from '@/styles/status-badges';

const EXPORT_STATUS_TONE: Record<ExportStatus, BadgeTone> = {
  QUEUED: 'amber',
  PROCESSING: 'indigo',
  COMPLETED: 'emerald',
  FAILED: 'rose',
};

const REPORT_TYPE_LABEL: Record<ExportReportType, { ar: string; en: string }> = {
  products: { ar: 'المنتجات', en: 'Products' },
  inventory: { ar: 'المخزون', en: 'Inventory' },
  orders: { ar: 'الطلبات', en: 'Orders' },
  stock_movements: { ar: 'حركات المخزون', en: 'Stock Ledger' },
};

export function ExportJobsPanel({
  onQuickExport,
}: {
  onQuickExport?: (type: ExportReportType) => void;
}) {
  const { locale } = useUi();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isAr = locale === 'ar';

  const [reportType, setReportType] = useState<ExportReportType | ''>('');
  const [status, setStatus] = useState<ExportStatus | ''>('');
  const [page, setPage] = useState(1);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['export-jobs', { page, reportType, status }],
    queryFn: () => {
      const sp = new URLSearchParams({ page: String(page), limit: '10' });
      if (reportType) sp.set('reportType', reportType);
      if (status) sp.set('status', status);
      return apiFetch<OffsetPaginatedResponse<ExportJobDto>>(`/reports/jobs?${sp.toString()}`);
    },
    refetchInterval: (query) => {
      const rows = query.state.data?.data ?? [];
      const hasInFlight = rows.some(
        (job) => job.status === EXPORT_STATUSES.QUEUED || job.status === EXPORT_STATUSES.PROCESSING,
      );
      return hasInFlight ? 3000 : false;
    },
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: string) =>
      apiFetch<ExportJobDto>(`/reports/jobs/${jobId}/retry`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['export-jobs'] });
      pushToast({
        variant: 'info',
        title: isAr ? 'تمت إعادة جدولة التصدير' : 'Export job re-queued',
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'تعذّرت إعادة المحاولة' : 'Retry failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  const handleDownload = async (job: ExportJobDto) => {
    setDownloadingId(job.id);
    try {
      const ext = job.format === 'XLSX' ? 'xlsx' : 'pdf';
      const res = await apiFetchExportOrBlob(`/reports/jobs/${job.id}/download`, {
        method: 'GET',
        fallbackFilename: `omniops-${job.reportType}-${job.id.slice(0, 8)}.${ext}`,
      });
      if (res.kind === 'blob') {
        triggerBlobDownload(res.blob, res.filename);
        pushToast({
          variant: 'success',
          title: isAr ? 'بدأ تنزيل الملف من MinIO' : 'Download started from MinIO',
          description: res.filename,
        });
      }
    } catch (err) {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل تنزيل الملف' : 'Download failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <PermissionGate permission={PERMISSIONS.REPORTS_EXPORT}>
      <section id="exports" className="overflow-hidden rounded-card border border-border bg-surface">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-bold text-ink-primary">
                {isAr
                  ? 'مركز مهام التصدير (Export Jobs Center)'
                  : 'Export Jobs Center (BullMQ + MinIO)'}
              </h2>
              <p className="text-[11px] text-ink-secondary">
                {isAr
                  ? 'متابعة مهام التصدير الضخمة بالخلفية وتنزيل الملفات المؤمّنة قبل انتهاء صلاحيتها (24 ساعة).'
                  : 'Track async background exports and download ownership-verified files from MinIO (24h retention).'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onQuickExport && (
              <button
                type="button"
                onClick={() => onQuickExport('orders')}
                className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                <Download className="h-3.5 w-3.5" />
                {isAr ? 'تصدير تقرير جديد' : 'New Export'}
              </button>
            )}

            <select
              aria-label="Filter export jobs by report type"
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value as ExportReportType | '');
                setPage(1);
              }}
              className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none"
            >
              <option value="">{isAr ? 'كل التقارير' : 'All Reports'}</option>
              {EXPORT_REPORT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {isAr ? REPORT_TYPE_LABEL[t].ar : REPORT_TYPE_LABEL[t].en}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter export jobs by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as ExportStatus | '');
                setPage(1);
              }}
              className="h-8 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-primary outline-none"
            >
              <option value="">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
              {Object.values(EXPORT_STATUSES).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void refetch()}
              title={isAr ? 'تحديث' : 'Refresh'}
              className="inline-flex h-8 items-center gap-1 rounded-control border border-border bg-canvas px-2.5 text-xs text-ink-secondary hover:bg-subtle hover:text-ink-primary"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start text-xs">
            <thead>
              <tr className="border-b border-border bg-subtle text-ink-secondary">
                <th className="px-4 py-2.5 text-start font-semibold">
                  {isAr ? 'التقرير' : 'Report'}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {isAr ? 'الصيغة' : 'Format'}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {isAr ? 'عدد الصفوف' : 'Rows'}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {isAr ? 'الحالة' : 'Status'}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {isAr ? 'بواسطة' : 'Requested By'}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {isAr ? 'وقت الطلب' : 'Created'}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {isAr ? 'الصلاحية' : 'Expires'}
                </th>
                <th className="px-4 py-2.5 text-end font-semibold">
                  {isAr ? 'الإجراء' : 'Action'}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="h-[44px] border-b border-border">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4">
                        <div className="h-3.5 w-20 animate-pulse rounded bg-subtle" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-ink-secondary">
                    {isAr
                      ? 'لا توجد مهام تصدير بالخلفية حتى الآن. التقارير التي تتجاوز 5,000 صف ستظهر هنا تلقائياً.'
                      : 'No background export jobs yet. Exports over 5,000 rows will appear here automatically.'}
                  </td>
                </tr>
              ) : (
                rows.map((job) => {
                  const st = getBadgeTokenStyles(EXPORT_STATUS_TONE[job.status] ?? 'zinc');
                  const typeLabel = REPORT_TYPE_LABEL[job.reportType];
                  const isDownloading = downloadingId === job.id;
                  return (
                    <tr
                      key={job.id}
                      className="h-[44px] border-b border-border last:border-b-0 hover:bg-subtle/50"
                    >
                      <td className="px-4 font-medium text-ink-primary">
                        <div>
                          {typeLabel
                            ? isAr
                              ? typeLabel.ar
                              : typeLabel.en
                            : job.reportType}
                        </div>
                        <div dir="ltr" className="mono-tabular text-[10px] text-ink-secondary">
                          {job.id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4">
                        <span className="inline-flex items-center gap-1 rounded-control border border-border bg-canvas px-2 py-0.5 text-[11px] font-semibold text-ink-primary">
                          {job.format === 'XLSX' ? (
                            <FileSpreadsheet className="h-3 w-3 text-primary" />
                          ) : (
                            <FileText className="h-3 w-3 text-primary" />
                          )}
                          {job.format}
                        </span>
                      </td>
                      <td className="mono-tabular px-4 font-semibold text-ink-primary">
                        {job.rowCount !== null ? job.rowCount.toLocaleString() : '—'}
                      </td>
                      <td className="px-4">
                        <span className="status-pill" style={st.pill}>
                          <span className="status-dot" style={st.dot} />
                          {job.status}
                        </span>
                        {job.errorMessage && (
                          <div className="mt-0.5 max-w-[200px] truncate text-[10px] text-ink-secondary" title={job.errorMessage}>
                            {job.errorMessage}
                          </div>
                        )}
                      </td>
                      <td className="px-4 text-ink-secondary">{job.requestedByName}</td>
                      <td dir="ltr" className="mono-tabular whitespace-nowrap px-4 text-ink-secondary">
                        {new Date(job.createdAt).toLocaleString()}
                      </td>
                      <td dir="ltr" className="mono-tabular whitespace-nowrap px-4 text-ink-secondary">
                        {job.expiresAt
                          ? job.isExpired
                            ? isAr
                              ? 'منتهي'
                              : 'Expired'
                            : new Date(job.expiresAt).toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-4 text-end">
                        {job.canDownload ? (
                          <button
                            type="button"
                            disabled={isDownloading}
                            onClick={() => void handleDownload(job)}
                            className="inline-flex items-center gap-1 rounded-control bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                          >
                            {isDownloading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                            {isAr ? 'تنزيل' : 'Download'}
                          </button>
                        ) : job.status === EXPORT_STATUSES.FAILED ? (
                          <button
                            type="button"
                            disabled={retryMutation.isPending}
                            onClick={() => retryMutation.mutate(job.id)}
                            className="inline-flex items-center gap-1 rounded-control border border-border bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink-primary hover:bg-subtle disabled:opacity-50"
                          >
                            <RotateCcw className="h-3 w-3" />
                            {isAr ? 'إعادة' : 'Retry'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-ink-secondary">
                            {job.isExpired
                              ? isAr
                                ? 'تم الحذف'
                                : 'Cleaned'
                              : isAr
                                ? 'قيد المعالجة...'
                                : 'In progress...'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Simple Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border bg-canvas px-4 py-2.5 text-xs text-ink-secondary">
            <span>
              {isAr
                ? `صفحة ${meta.page} من ${meta.totalPages} (${meta.total} مهمة)`
                : `Page ${meta.page} of ${meta.totalPages} (${meta.total} jobs)`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-control border border-border bg-surface px-2.5 py-1 text-ink-primary hover:bg-subtle disabled:opacity-40"
              >
                {isAr ? 'السابق' : 'Prev'}
              </button>
              <button
                type="button"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-control border border-border bg-surface px-2.5 py-1 text-ink-primary hover:bg-subtle disabled:opacity-40"
              >
                {isAr ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>
        )}
      </section>
    </PermissionGate>
  );
}
