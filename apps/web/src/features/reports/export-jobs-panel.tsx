'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EXPORT_STATUSES,
  PERMISSIONS,
  type ExportJobDto,
  type ExportReportType,
  type ExportStatus,
  type OffsetPaginatedResponse,
} from '@omni-ops/shared';
import { Download, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { PermissionGate } from '@/components/rbac/permission-gate';
import {
  ApiError,
  apiFetch,
  apiFetchExportOrBlob,
  triggerBlobDownload,
} from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';

const REPORT_FILENAME_LABEL: Record<string, string> = {
  orders: 'orders_2026.xlsx',
  inventory: 'inventory_report.csv',
  products: 'customers_list.xlsx',
  stock_movements: 'stock_ledger_2026.xlsx',
};

const STATUS_BADGE_BG: Record<ExportStatus, string> = {
  COMPLETED: '#10B981',
  PROCESSING: '#D97706',
  QUEUED: '#D97706',
  FAILED: '#E11D48',
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

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['export-jobs'],
    queryFn: () =>
      apiFetch<OffsetPaginatedResponse<ExportJobDto>>('/reports/jobs?page=1&limit=10'),
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
      const fallbackName = job.id.includes('.')
        ? job.id
        : (REPORT_FILENAME_LABEL[job.reportType] ?? `omniops-${job.reportType}.${ext}`);
      const res = await apiFetchExportOrBlob(`/reports/jobs/${job.id}/download`, {
        method: 'GET',
        fallbackFilename: fallbackName,
      });
      if (res.kind === 'blob') {
        triggerBlobDownload(res.blob, res.filename);
        pushToast({
          variant: 'success',
          title: isAr ? 'بدأ تنزيل الملف' : 'Download started',
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

  return (
    <PermissionGate permission={PERMISSIONS.REPORTS_EXPORT}>
      <section
        id="exports"
        className="flex flex-col justify-between overflow-hidden rounded-card border border-border bg-surface text-start"
      >
        {/* Header matching Mockup 3 */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3.5">
          <h2 className="text-sm font-bold text-ink-primary">
            {isAr ? 'مركز مهام التصدير' : 'Export Jobs Center'}
          </h2>
          <div className="flex items-center gap-1.5">
            {onQuickExport && (
              <button
                type="button"
                onClick={() => onQuickExport('orders')}
                className="rounded-control border border-border bg-canvas px-2.5 py-1 text-[11px] font-semibold text-ink-primary hover:bg-subtle"
              >
                {isAr ? '+ تصدير' : '+ Export'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void refetch()}
              title={isAr ? 'تحديث' : 'Refresh'}
              className="inline-flex h-7 w-7 items-center justify-center rounded-control border border-border bg-canvas text-ink-secondary hover:bg-subtle hover:text-ink-primary"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table matching Mockup 3 */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start text-xs">
            <thead>
              <tr className="border-b border-border bg-subtle text-ink-secondary">
                <th className="px-4 py-2.5 text-start font-semibold">
                  {isAr ? 'اسم الملف' : 'File Name'}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {isAr ? 'التفاصيل' : 'Details'}
                </th>
                <th className="px-4 py-2.5 text-start font-semibold">
                  {isAr ? 'الحالة' : 'Status'}
                </th>
                <th className="px-4 py-2.5 text-end font-semibold" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="h-[48px] border-b border-border">
                    {Array.from({ length: 4 }).map((__, j) => (
                      <td key={j} className="px-4">
                        <div className="h-3.5 w-20 animate-pulse rounded bg-subtle" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-ink-secondary">
                    {isAr ? 'لا توجد مهام تصدير حالياً' : 'No export jobs yet'}
                  </td>
                </tr>
              ) : (
                rows.map((job) => {
                  const isDownloading = downloadingId === job.id;
                  const fileName = job.id.includes('.')
                    ? job.id
                    : (REPORT_FILENAME_LABEL[job.reportType] ??
                      `${job.reportType}_${job.id.slice(0, 6)}.${job.format.toLowerCase()}`);
                  return (
                    <tr
                      key={job.id}
                      className="h-[48px] border-b border-border last:border-b-0 hover:bg-subtle/50"
                    >
                      <td dir="ltr" className="mono-tabular px-4 font-semibold text-ink-primary">
                        {fileName}
                      </td>
                      <td className="mono-tabular px-4 font-medium text-ink-primary">
                        {job.rowCount !== null
                          ? isAr
                            ? `${job.rowCount.toLocaleString()} صف`
                            : `${job.rowCount.toLocaleString()} rows`
                          : '—'}
                      </td>
                      <td className="px-4">
                        <span
                          className="mono-tabular inline-flex items-center rounded-pill px-3 py-0.5 text-[11px] font-bold text-white"
                          style={{
                            backgroundColor: STATUS_BADGE_BG[job.status] ?? '#71717A',
                          }}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 text-end">
                        {job.canDownload ? (
                          <button
                            type="button"
                            disabled={isDownloading}
                            onClick={() => void handleDownload(job)}
                            className="inline-flex items-center gap-1 rounded-control border border-border bg-surface px-3 py-1 text-xs font-semibold text-ink-primary hover:bg-subtle disabled:opacity-50"
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
                            className="inline-flex items-center gap-1 rounded-control border border-border bg-canvas px-2.5 py-1 text-[11px] font-medium text-ink-primary hover:bg-subtle"
                          >
                            <RotateCcw className="h-3 w-3" />
                            {isAr ? 'إعادة' : 'Retry'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="rounded-control border border-border bg-subtle px-3 py-1 text-xs font-medium text-ink-secondary opacity-60"
                          >
                            {isAr ? 'تنزيل' : 'Download'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PermissionGate>
  );
}
