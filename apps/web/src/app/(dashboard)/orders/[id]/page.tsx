'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ALLOWED_ORDER_TRANSITIONS,
  ORDER_STATUSES,
  PERMISSIONS,
  requiresTransitionReason,
  type OrderDetailDto,
  type OrderStatus,
} from '@omni-ops/shared';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Clock,
  FileDown,
  Loader2,
  PackageCheck,
  User,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PermissionGate, RoutePermissionGuard } from '@/components/rbac/permission-gate';
import {
  apiFetch,
  ApiError,
  apiFetchExportOrBlob,
  triggerBlobDownload,
} from '@/lib/api-client';
import { useAuth, useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';
import { getBadgeTokenStyles, ORDER_STATUS_TONE } from '@/styles/status-badges';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { locale } = useUi();
  const { can } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isAr = locale === 'ar';

  const [sensitiveTarget, setSensitiveTarget] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadInvoice = async () => {
    if (!order) return;
    setDownloadingPdf(true);
    try {
      const res = await apiFetchExportOrBlob(`/reports/orders/${order.id}/invoice.pdf`, {
        method: 'GET',
        fallbackFilename: `invoice-${order.orderNumber}.pdf`,
      });
      if (res.kind === 'blob') {
        triggerBlobDownload(res.blob, res.filename);
        pushToast({
          variant: 'success',
          title: isAr ? 'تم تنزيل الفاتورة بصيغة PDF' : 'Invoice PDF downloaded',
          description: res.filename,
        });
      }
    } catch (err) {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل تحميل فاتورة الطلب' : 'Failed to download invoice PDF',
        description: err instanceof ApiError ? err.message : undefined,
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['order-detail', params.id],
    queryFn: () => apiFetch<OrderDetailDto>(`/orders/${params.id}`),
    enabled: Boolean(params.id),
  });

  const transitionMutation = useMutation({
    mutationFn: (payload: { toStatus: OrderStatus; reason?: string; restock?: boolean }) =>
      apiFetch<OrderDetailDto>(`/orders/${params.id}/status`, {
        method: 'POST',
        body: payload,
      }),
    onSuccess: (updated) => {
      setSensitiveTarget(null);
      setReason('');
      queryClient.setQueryData(['order-detail', params.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-levels'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      pushToast({
        variant: 'success',
        title: isAr ? `تم تحديث حالة الطلب إلى ${updated.status}` : `Order updated to ${updated.status}`,
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل تحديث حالة الطلب' : 'Status transition failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  const availableTransitions = order
    ? ALLOWED_ORDER_TRANSITIONS[order.status].filter((nextStatus) => {
        if (nextStatus === ORDER_STATUSES.CANCELLED) return can(PERMISSIONS.ORDERS_CANCEL);
        if (nextStatus === ORDER_STATUSES.REFUNDED) return can(PERMISSIONS.ORDERS_REFUND);
        return can(PERMISSIONS.ORDERS_WRITE);
      })
    : [];

  return (
    <RoutePermissionGuard permission={PERMISSIONS.ORDERS_READ}>
      <div className="space-y-5 text-start">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {isAr ? 'العودة إلى قائمة الطلبات' : 'Back to Orders'}
        </Link>

        {isLoading ? (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="h-80 animate-pulse rounded-card bg-subtle lg:col-span-2" />
            <div className="h-80 animate-pulse rounded-card bg-subtle" />
          </div>
        ) : error || !order ? (
          <div className="rounded-card border border-border bg-surface p-6 text-sm text-ink-secondary">
            {isAr ? 'الطلب غير موجود.' : 'Order not found.'}
          </div>
        ) : (
          <>
            {/* Top Order Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-surface p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 dir="ltr" className="mono-tabular text-xl font-bold text-ink-primary">
                    {order.orderNumber}
                  </h1>
                  <span
                    className="status-pill"
                    style={getBadgeTokenStyles(ORDER_STATUS_TONE[order.status]).pill}
                  >
                    <span
                      className="status-dot"
                      style={getBadgeTokenStyles(ORDER_STATUS_TONE[order.status]).dot}
                    />
                    {order.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-secondary">
                  {isAr ? 'أُنشئ بواسطة' : 'Created by'} {order.createdByName} •{' '}
                  <span dir="ltr" className="mono-tabular inline-block">
                    {new Date(order.createdAt).toLocaleString()}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <PermissionGate permission={PERMISSIONS.REPORTS_EXPORT}>
                  <button
                    type="button"
                    disabled={downloadingPdf}
                    onClick={() => void handleDownloadInvoice()}
                    className="inline-flex items-center gap-1.5 rounded-control border border-border bg-canvas px-3 py-2 text-xs font-semibold text-ink-primary hover:bg-subtle disabled:opacity-50"
                  >
                    {downloadingPdf ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : (
                      <FileDown className="h-3.5 w-3.5 text-primary" />
                    )}
                    {isAr ? 'تحميل الفاتورة PDF' : 'Download Invoice PDF'}
                  </button>
                </PermissionGate>
                <div className="text-end">
                  <div className="text-xs text-ink-secondary">{isAr ? 'إجمالي الطلب' : 'Order Total'}</div>
                  <div className="mono-tabular text-2xl font-bold text-primary">
                    ${order.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>

            {/* Approved 2/3 + 1/3 Layout */}
            <div className="grid gap-5 lg:grid-cols-3">
              {/* Main 2/3 Column: Customer, Items & Financials */}
              <div className="space-y-5 lg:col-span-2">
                {/* Customer & Warehouse Cards */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-card border border-border bg-surface p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
                      <User className="h-3.5 w-3.5 text-primary" />
                      {isAr ? 'بيانات العميل' : 'Customer'}
                    </div>
                    <div className="mt-2 text-sm font-bold text-ink-primary">
                      {order.customerName}
                    </div>
                    {order.customerCompany && (
                      <div className="text-xs text-ink-secondary">{order.customerCompany}</div>
                    )}
                    <div dir="ltr" className="mono-tabular mt-1 text-xs text-ink-secondary">
                      {order.customerEmail}
                    </div>
                    {order.customerPhone && (
                      <div dir="ltr" className="mono-tabular text-xs text-ink-secondary">
                        {order.customerPhone}
                      </div>
                    )}
                  </div>

                  <div className="rounded-card border border-border bg-surface p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
                      <Building2 className="h-3.5 w-3.5 text-primary" />
                      {isAr ? 'مستودع التنفيذ' : 'Fulfillment Warehouse'}
                    </div>
                    <div dir="ltr" className="mono-tabular mt-2 inline-block text-sm font-bold text-primary">
                      {order.warehouseCode}
                    </div>
                    <div className="text-xs text-ink-primary">{order.warehouseName}</div>
                    {order.cancellationReason && (
                      <div
                        className="mt-2 rounded-control border p-2 text-xs"
                        style={{
                          backgroundColor: 'var(--status-rose-bg)',
                          color: 'var(--status-rose-text)',
                          borderColor: 'var(--diff-before-border)',
                        }}
                      >
                        <strong>{isAr ? 'سبب الإلغاء/الاسترداد:' : 'Reason:'}</strong>{' '}
                        {order.cancellationReason}
                      </div>
                    )}
                  </div>
                </div>

                {/* Line Items Table */}
                <section className="overflow-hidden rounded-card border border-border bg-surface">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <PackageCheck className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold text-ink-primary">
                      {isAr ? `بنود الطلب (${order.items.length})` : `Order Line Items (${order.items.length})`}
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-start text-xs">
                      <thead>
                        <tr className="border-b border-border bg-subtle text-ink-secondary">
                          <th className="px-4 py-2.5 text-start font-semibold">SKU</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'المنتج' : 'Product'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'الكمية' : 'Qty'}</th>
                          <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'سعر الوحدة' : 'Unit Price'}</th>
                          <th className="px-4 py-2.5 text-end font-semibold">{isAr ? 'الإجمالي' : 'Line Total'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.map((item) => (
                          <tr key={item.id} className="h-[44px] border-b border-border last:border-b-0">
                            <td className="px-4">
                              <Link
                                href={`/products/${item.productId}`}
                                dir="ltr"
                                className="mono-tabular inline-block font-semibold text-primary hover:underline"
                              >
                                {item.productSku}
                              </Link>
                            </td>
                            <td className="px-4 font-medium text-ink-primary">{item.productName}</td>
                            <td className="mono-tabular px-4">{item.quantity}</td>
                            <td className="mono-tabular px-4 text-ink-secondary">
                              ${item.unitPriceSnapshot.toFixed(2)}
                            </td>
                            <td className="mono-tabular px-4 text-end font-semibold text-ink-primary">
                              ${item.lineTotal.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Summary */}
                  <div className="border-t border-border bg-canvas px-4 py-3 text-xs">
                    <div className="ms-auto max-w-xs space-y-1.5">
                      <div className="flex justify-between text-ink-secondary">
                        <span>{isAr ? 'المجموع الفرعي' : 'Subtotal'}</span>
                        <span className="mono-tabular">${order.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-ink-secondary">
                        <span>{isAr ? 'الخصم' : 'Discount'}</span>
                        <span className="mono-tabular">-${order.discountAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-ink-secondary">
                        <span>{isAr ? 'الضريبة' : 'Tax'}</span>
                        <span className="mono-tabular">${order.taxAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t border-border pt-1.5 text-sm font-bold text-ink-primary">
                        <span>{isAr ? 'الإجمالي النهائي' : 'Total'}</span>
                        <span className="mono-tabular text-primary">${order.totalAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* Right/End 1/3 Column: Smart Status Transition Panel + Vertical Timeline */}
              <div className="space-y-5">
                {/* Smart Transition Panel */}
                <section className="rounded-card border border-border bg-surface p-4">
                  <h2 className="text-sm font-semibold text-ink-primary">
                    {isAr ? 'الانتقال للحالة التالية' : 'Order Actions'}
                  </h2>
                  <p className="mt-1 text-xs text-ink-secondary">
                    {isAr
                      ? 'الإجراءات المتاحة حسب آلة الحالات وصلاحيات دورك:'
                      : 'Allowed state-machine transitions for your RBAC role:'}
                  </p>

                  {availableTransitions.length === 0 ? (
                    <div className="mt-3 rounded-control border border-border bg-subtle p-3 text-xs text-ink-secondary">
                      {isAr
                        ? 'لا توجد انتقالات إضافية متاحة لهذه الحالة.'
                        : 'No further transitions available for this order.'}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {availableTransitions.map((nextStatus) => {
                        const isSensitive = requiresTransitionReason(nextStatus);
                        return (
                          <button
                            key={nextStatus}
                            type="button"
                            disabled={transitionMutation.isPending}
                            onClick={() => {
                              if (isSensitive) {
                                setSensitiveTarget(nextStatus);
                                setReason('');
                                setRestock(true);
                              } else {
                                transitionMutation.mutate({ toStatus: nextStatus });
                              }
                            }}
                            className="w-full rounded-control px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50"
                            style={
                              isSensitive
                                ? {
                                    backgroundColor: 'var(--status-rose-bg)',
                                    color: 'var(--status-rose-text)',
                                    border: '1px solid var(--diff-before-border)',
                                  }
                                : {
                                    backgroundColor: 'var(--color-primary)',
                                    color: 'var(--color-primary-foreground)',
                                  }
                            }
                          >
                            {isAr ? `نقل الحالة إلى ${nextStatus}` : `Transition to ${nextStatus}`}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Vertical Order Timeline */}
                <section className="rounded-card border border-border bg-surface p-4">
                  <div className="flex items-center gap-2 border-b border-border pb-2.5">
                    <Clock className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold text-ink-primary">
                      {isAr ? 'الخط الزمني للطلب (Order Timeline)' : 'Order Timeline'}
                    </h2>
                  </div>

                  <ol className="relative mt-4 space-y-4 border-s-2 border-border ps-4">
                    {order.statusHistory.map((step) => {
                      const st = getBadgeTokenStyles(ORDER_STATUS_TONE[step.toStatus]);
                      return (
                        <li key={step.id} className="relative">
                          <span
                            className="absolute -start-[21px] top-1 h-2.5 w-2.5 rounded-pill border-2 border-surface"
                            style={{ backgroundColor: st.dot.backgroundColor }}
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="status-pill" style={st.pill}>
                              <span className="status-dot" style={st.dot} />
                              {step.toStatus}
                            </span>
                            <span className="text-[11px] text-ink-secondary">
                              {step.changedByName}
                            </span>
                          </div>
                          {step.reason && (
                            <p className="mt-1 text-xs text-ink-primary">{step.reason}</p>
                          )}
                          <div dir="ltr" className="mono-tabular mt-0.5 text-[11px] text-ink-secondary">
                            {new Date(step.createdAt).toLocaleString()}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              </div>
            </div>
          </>
        )}

        {/* Sensitive Order Action Modal (CANCELLED / REFUNDED) */}
        {sensitiveTarget && order && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setSensitiveTarget(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-md rounded-card border border-border bg-surface p-5 text-start"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" style={{ color: 'var(--status-rose-dot)' }} />
                  <h3 className="text-sm font-bold text-ink-primary">
                    {sensitiveTarget === ORDER_STATUSES.CANCELLED
                      ? isAr
                        ? 'تأكيد إلغاء الطلب'
                        : 'Confirm Order Cancellation'
                      : isAr
                        ? 'تأكيد استرداد الطلب'
                        : 'Confirm Order Refund'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSensitiveTarget(null)}
                  className="text-ink-secondary hover:text-ink-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div
                className="mt-3 rounded-control border p-3 text-xs"
                style={{
                  backgroundColor: 'var(--status-amber-bg)',
                  color: 'var(--status-amber-text)',
                  borderColor: 'var(--color-border)',
                }}
              >
                {sensitiveTarget === ORDER_STATUSES.CANCELLED
                  ? isAr
                    ? `سيؤدي الإلغاء إلى تحرير المخزون المحجوز لـ ${order.items.length} بند في المستودع ${order.warehouseCode} فوراً.`
                    : `Cancelling will release reserved inventory for ${order.items.length} item(s) in ${order.warehouseCode}.`
                  : isAr
                    ? `يمكنك اختيار إعادة البضاعة المستردة إلى الرصيد الفعلي في ${order.warehouseCode} مع تسجيل حركة IN.`
                    : `Optionally restock returned items into ${order.warehouseCode} on-hand balance with an IN ledger entry.`}
              </div>

              {sensitiveTarget === ORDER_STATUSES.REFUNDED && (
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-ink-primary">
                  <input
                    type="checkbox"
                    checked={restock}
                    onChange={(e) => setRestock(e.target.checked)}
                    className="h-4 w-4 rounded accent-primary"
                  />
                  <span>
                    {isAr
                      ? 'إعادة الكميات المستردة إلى المخزون (Restock Inventory)'
                      : 'Restock returned items into warehouse inventory'}
                  </span>
                </label>
              )}

              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-ink-primary">
                  {isAr ? 'السبب الإلزامي *' : 'Mandatory Reason *'}
                </label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={isAr ? 'اكتب سبب الإلغاء أو الاسترداد...' : 'Enter cancellation/refund reason...'}
                  className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSensitiveTarget(null)}
                  className="rounded-control border border-border bg-canvas px-3.5 py-2 text-xs font-medium text-ink-primary hover:bg-subtle"
                >
                  {isAr ? 'تراجع' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={transitionMutation.isPending || reason.trim().length < 3}
                  onClick={() =>
                    transitionMutation.mutate({
                      toStatus: sensitiveTarget,
                      reason: reason.trim(),
                      restock,
                    })
                  }
                  className="rounded-control px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--status-rose-dot)' }}
                >
                  {transitionMutation.isPending
                    ? isAr
                      ? 'جارٍ التنفيذ...'
                      : 'Processing...'
                    : isAr
                      ? 'تأكيد العملية'
                      : 'Confirm Action'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoutePermissionGuard>
  );
}
