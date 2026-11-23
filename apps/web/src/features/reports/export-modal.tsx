'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  EXPORT_FORMATS,
  REPORT_COLUMN_DEFINITIONS,
  type ExportFormat,
  type ExportJobDto,
  type ExportReportType,
  type ExportScope,
} from '@omni-ops/shared';
import { Check, Download, FileSpreadsheet, FileText, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import {
  ApiError,
  apiFetchExportOrBlob,
  triggerBlobDownload,
} from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';

interface AsyncExportResponse {
  mode: 'async';
  estimatedRows: number;
  job: ExportJobDto;
}

const REPORT_LABELS: Record<ExportReportType, { ar: string; en: string }> = {
  products: { ar: 'دليل المنتجات', en: 'Products Catalog' },
  inventory: { ar: 'مستويات المخزون', en: 'Inventory Levels' },
  orders: { ar: 'تقرير الطلبات', en: 'Orders Report' },
  stock_movements: { ar: 'سجل حركات المخزون', en: 'Stock Movements Ledger' },
};

export interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  reportType: ExportReportType;
  filters?: Record<string, unknown>;
}

export function ExportModal({ open, onClose, reportType, filters = {} }: ExportModalProps) {
  const { locale } = useUi();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isAr = locale === 'ar';

  const allColumns = REPORT_COLUMN_DEFINITIONS[reportType];

  const [format, setFormat] = useState<ExportFormat>(EXPORT_FORMATS.XLSX);
  const [scope, setScope] = useState<ExportScope>('all_filtered');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() =>
    allColumns.map((c) => c.key),
  );
  const [lastAsyncJob, setLastAsyncJob] = useState<AsyncExportResponse | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedColumns(REPORT_COLUMN_DEFINITIONS[reportType].map((c) => c.key));
      setLastAsyncJob(null);
    }
  }, [open, reportType]);

  const exportMutation = useMutation({
    mutationFn: () =>
      apiFetchExportOrBlob<AsyncExportResponse>('/reports/export', {
        method: 'POST',
        body: {
          reportType,
          format,
          scope,
          columns: selectedColumns,
          filters,
        },
        fallbackFilename: `omniops-${reportType}.${format === EXPORT_FORMATS.XLSX ? 'xlsx' : 'pdf'}`,
      }),
    onSuccess: (res) => {
      if (res.kind === 'blob') {
        triggerBlobDownload(res.blob, res.filename);
        pushToast({
          variant: 'success',
          title: isAr ? 'تم تنزيل الملف بنجاح' : 'Export downloaded',
          description:
            res.rowCount !== undefined
              ? isAr
                ? `${res.filename} (${res.rowCount.toLocaleString()} صف)`
                : `${res.filename} (${res.rowCount.toLocaleString()} rows)`
              : res.filename,
        });
        onClose();
      } else {
        setLastAsyncJob(res.data);
        void queryClient.invalidateQueries({ queryKey: ['export-jobs'] });
        void queryClient.invalidateQueries({ queryKey: ['app-context'] });
        pushToast({
          variant: 'info',
          title: isAr ? 'تمت جدولة التصدير بالخلفية' : 'Background export queued',
          description: isAr
            ? `تجاوز التقرير 5,000 صف (${res.data.estimatedRows.toLocaleString()} صف). ستصلك إشعار فور جاهزيته.`
            : `Report exceeds 5,000 rows (${res.data.estimatedRows.toLocaleString()} rows). You will be notified when ready.`,
        });
      }
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل تصدير التقرير' : 'Export failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  if (!open) return null;

  const toggleColumn = (key: string) => {
    setSelectedColumns((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev; // require at least 1 column
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        className="w-full max-w-lg rounded-card border border-border bg-surface text-start"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <h2 id="export-modal-title" className="text-sm font-bold text-ink-primary">
              {isAr ? 'إعداد وتصدير التقرير' : 'Export Report Configuration'}
            </h2>
            <p className="mt-0.5 text-[11px] text-ink-secondary">
              {isAr ? REPORT_LABELS[reportType].ar : REPORT_LABELS[reportType].en}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="rounded-control p-1 text-ink-secondary hover:bg-subtle hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          {lastAsyncJob ? (
            <div
              className="space-y-3 rounded-card border p-4"
              style={{
                backgroundColor: 'var(--status-indigo-bg)',
                borderColor: 'var(--color-primary)',
              }}
            >
              <div className="text-xs font-bold text-ink-primary">
                {isAr
                  ? 'تم تحويل التقرير للتصدير غير المتزامن (BullMQ + MinIO)'
                  : 'Queued as Background Export Job (BullMQ + MinIO)'}
              </div>
              <p className="text-xs text-ink-secondary">
                {isAr
                  ? `عدد الصفوف التقديري: ${lastAsyncJob.estimatedRows.toLocaleString()} صف. يجري توليد الملف الآن وحفظه بأمان لمدة 24 ساعة.`
                  : `Estimated ${lastAsyncJob.estimatedRows.toLocaleString()} rows. Generating in background worker and storing securely for 24h.`}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Link
                  href="/analytics#exports"
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  {isAr ? 'متابعة حالة التصدير' : 'View Export Jobs Center'}
                </Link>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-subtle"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Format Toggle */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-primary">
                  {isAr ? 'صيغة الملف' : 'Export Format'}
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(
                    [
                      {
                        value: EXPORT_FORMATS.XLSX,
                        icon: FileSpreadsheet,
                        title: 'Excel (.xlsx)',
                        descAr: 'بث مباشر للبيانات الكبيرة',
                        descEn: 'Streaming workbook for datasets',
                      },
                      {
                        value: EXPORT_FORMATS.PDF,
                        icon: FileText,
                        title: 'PDF (.pdf)',
                        descAr: 'تقرير منسّق للطباعة (حتى 1,000 صف)',
                        descEn: 'Print-ready layout (up to 1,000 rows)',
                      },
                    ] as const
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const active = format === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormat(opt.value)}
                        className={`flex items-start gap-2.5 rounded-card border p-3 text-start transition-colors ${
                          active
                            ? 'border-primary bg-primary-soft'
                            : 'border-border bg-canvas hover:bg-subtle'
                        }`}
                      >
                        <Icon
                          className={`mt-0.5 h-4 w-4 shrink-0 ${
                            active ? 'text-primary' : 'text-ink-secondary'
                          }`}
                        />
                        <div>
                          <div className="text-xs font-semibold text-ink-primary">{opt.title}</div>
                          <div className="mt-0.5 text-[11px] text-ink-secondary">
                            {isAr ? opt.descAr : opt.descEn}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Scope Radio */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-primary">
                  {isAr ? 'نطاق البيانات' : 'Data Scope'}
                </label>
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  {(
                    [
                      {
                        value: 'all_filtered',
                        ar: 'كافة النتائج المفلترة',
                        en: 'All Filtered Results',
                      },
                      {
                        value: 'current_page',
                        ar: 'الصفحة الحالية فقط',
                        en: 'Current Page Only',
                      },
                    ] as const
                  ).map((s) => (
                    <label
                      key={s.value}
                      className={`flex cursor-pointer items-center gap-2 rounded-control border px-3 py-2 ${
                        scope === s.value
                          ? 'border-primary bg-primary-soft text-ink-primary'
                          : 'border-border bg-canvas text-ink-secondary hover:text-ink-primary'
                      }`}
                    >
                      <input
                        type="radio"
                        name="export-scope"
                        value={s.value}
                        checked={scope === s.value}
                        onChange={() => setScope(s.value)}
                        className="accent-primary"
                      />
                      <span className="font-medium">{isAr ? s.ar : s.en}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-ink-secondary">
                  {isAr
                    ? 'التقارير حتى 5,000 صف تُحمَّل فوراً؛ الأكبر من ذلك تُعالج تلقائياً عبر BullMQ وتحفظ في MinIO.'
                    : 'Reports <= 5,000 rows download immediately; larger datasets run asynchronously via BullMQ + MinIO.'}
                </p>
              </div>

              {/* Columns Selector */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink-primary">
                    {isAr
                      ? `الأعمدة المشمولة (${selectedColumns.length}/${allColumns.length})`
                      : `Included Columns (${selectedColumns.length}/${allColumns.length})`}
                  </label>
                  <button
                    type="button"
                    onClick={() => setSelectedColumns(allColumns.map((c) => c.key))}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    {isAr ? 'تحديد الكل' : 'Select All'}
                  </button>
                </div>
                <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto rounded-control border border-border bg-canvas p-2.5">
                  {allColumns.map((col) => {
                    const checked = selectedColumns.includes(col.key);
                    return (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => toggleColumn(col.key)}
                        className={`flex items-center gap-2 rounded-control px-2 py-1.5 text-start text-xs transition-colors ${
                          checked
                            ? 'bg-surface font-medium text-ink-primary'
                            : 'text-ink-secondary hover:bg-subtle'
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-canvas'
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate">{isAr ? col.labelAr : col.labelEn}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!lastAsyncJob && (
          <div className="flex items-center justify-end gap-2 border-t border-border bg-canvas px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-border bg-surface px-3.5 py-2 text-xs font-medium text-ink-primary hover:bg-subtle"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={exportMutation.isPending || selectedColumns.length === 0}
              onClick={() => exportMutation.mutate()}
              className="inline-flex items-center gap-1.5 rounded-control bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {isAr ? 'جارٍ التجهيز...' : 'Preparing...'}
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  {isAr ? 'بدء التصدير' : 'Start Export'}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
