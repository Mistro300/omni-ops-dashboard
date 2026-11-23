'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CustomerListItemDto,
  OffsetPaginatedResponse,
  OrderDetailDto,
  ProductListItemDto,
  WarehouseDto,
} from '@omni-ops/shared';
import { AlertTriangle, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';

interface DraftLine {
  productId: string;
  quantity: number;
}

export function CreateOrderDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (order: OrderDetailDto) => void;
}) {
  const { locale } = useUi();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isAr = locale === 'ar';

  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [taxRatePct, setTaxRatePct] = useState(14);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const { data: customersRes } = useQuery({
    queryKey: ['customers-picker'],
    enabled: open,
    queryFn: () =>
      apiFetch<OffsetPaginatedResponse<CustomerListItemDto>>('/customers?limit=100&sortBy=name&sortDir=asc'),
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    enabled: open,
    queryFn: () => apiFetch<WarehouseDto[]>('/warehouses'),
  });

  const { data: productsRes } = useQuery({
    queryKey: ['products-picker', warehouseId],
    enabled: open && Boolean(warehouseId),
    queryFn: () =>
      apiFetch<OffsetPaginatedResponse<ProductListItemDto>>(
        `/products?limit=100&isActive=true&sortBy=sku&sortDir=asc&warehouseId=${warehouseId}`,
      ),
  });

  const customers = customersRes?.data ?? [];
  const activeWarehouses = warehouses.filter((w) => w.isActive);
  const products = productsRes?.data ?? [];

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  // Initialize defaults & fresh Idempotency-Key each time drawer opens
  useEffect(() => {
    if (!open) return;
    setIdempotencyKey(
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `ord-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    if (!customerId && customers[0]) setCustomerId(customers[0].id);
    if (!warehouseId && activeWarehouses[0]) setWarehouseId(activeWarehouses[0].id);
    if (lines.length === 0 && products[0]) {
      setLines([{ productId: products[0].id, quantity: 1 }]);
    }
  }, [open, customers, activeWarehouses, products]);

  const addLine = () => {
    const usedIds = new Set(lines.map((l) => l.productId));
    const nextProduct = products.find((p) => !usedIds.has(p.id));
    if (!nextProduct) return;
    setLines((prev) => [...prev, { productId: nextProduct.id, quantity: 1 }]);
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  };

  const financial = useMemo(() => {
    let subtotal = 0;
    let hasStockError = false;
    for (const line of lines) {
      const prod = productById.get(line.productId);
      if (prod) {
        subtotal += prod.unitPrice * line.quantity;
        if (line.quantity > prod.totalAvailable) {
          hasStockError = true;
        }
      }
    }
    const discount = Math.min(Math.max(0, discountAmount), subtotal);
    const taxable = Math.max(0, subtotal - discount);
    const tax = Number((taxable * (taxRatePct / 100)).toFixed(2));
    const total = Number((taxable + tax).toFixed(2));
    return { subtotal, discount, tax, total, hasStockError };
  }, [lines, productById, discountAmount, taxRatePct]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<OrderDetailDto>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: {
          customerId,
          warehouseId,
          items: lines,
          discountAmount: financial.discount,
          taxRate: taxRatePct / 100,
        },
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-levels'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      pushToast({
        variant: 'success',
        title: isAr ? 'تم إنشاء الطلب وحجز المخزون بنجاح' : 'Order created & stock reserved',
        description: created.orderNumber,
      });
      setLines([]);
      setDiscountAmount(0);
      onClose();
      onCreated?.(created);
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل إنشاء الطلب' : 'Order creation failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="flex h-full w-full max-w-[720px] flex-col border-s border-border bg-surface text-start"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-bold text-ink-primary">
                {isAr ? 'إنشاء طلب جديد (Create Order)' : 'Create New Order'}
              </h2>
              <p className="mt-0.5 text-xs text-ink-secondary">
                {isAr
                  ? 'يتم التحقق الفوري من المخزون المتاح وحجز الكمية ذرياً مع مفتاح Idempotency.'
                  : 'Real-time availability check with atomic reservation & Idempotency-Key protection.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1.5 text-ink-secondary hover:bg-subtle hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Step 1: Customer & Warehouse */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-primary">
                {isAr ? 'العميل *' : 'Customer *'}
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.companyName ? `— ${c.companyName}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-primary">
                {isAr ? 'مستودع التنفيذ *' : 'Fulfillment Warehouse *'}
              </label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
              >
                {activeWarehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.code} — {wh.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Step 2: Order Line Items */}
          <div className="rounded-card border border-border bg-canvas p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-primary">
                {isAr ? `بنود الطلب (${lines.length})` : `Order Items (${lines.length})`}
              </span>
              <button
                type="button"
                onClick={addLine}
                disabled={lines.length >= products.length}
                className="inline-flex items-center gap-1 rounded-control border border-border bg-surface px-2.5 py-1 text-xs font-medium text-primary hover:bg-subtle disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                {isAr ? 'إضافة صنف' : 'Add Item'}
              </button>
            </div>

            <div className="space-y-2.5">
              {lines.map((line, idx) => {
                const prod = productById.get(line.productId);
                const available = prod?.totalAvailable;
                const insufficient = available !== undefined && line.quantity > available;

                return (
                  <div
                    key={idx}
                    className="rounded-control border border-border bg-surface p-3"
                  >
                    <div className="grid items-center gap-2.5 sm:grid-cols-12">
                      <div className="sm:col-span-6">
                        <select
                          value={line.productId}
                          onChange={(e) => updateLine(idx, { productId: e.target.value })}
                          className="w-full rounded-control border border-border bg-canvas px-2.5 py-1.5 text-xs text-ink-primary outline-none focus:border-primary"
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} — {p.name} (${p.unitPrice.toFixed(2)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min="1"
                          dir="ltr"
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })
                          }
                          className="mono-tabular w-full rounded-control border border-border bg-canvas px-2.5 py-1.5 text-xs text-ink-primary outline-none focus:border-primary"
                        />
                      </div>

                      <div className="sm:col-span-3 text-end">
                        <div className="mono-tabular text-xs font-semibold text-ink-primary">
                          ${((prod?.unitPrice ?? 0) * line.quantity).toFixed(2)}
                        </div>
                        {available !== undefined && (
                          <div
                            className="text-[11px]"
                            style={{
                              color: insufficient
                                ? 'var(--status-rose-text)'
                                : 'var(--status-emerald-text)',
                            }}
                          >
                            {isAr ? `المتاح: ${available}` : `Avail: ${available}`}
                          </div>
                        )}
                      </div>

                      <div className="sm:col-span-1 text-end">
                        <button
                          type="button"
                          disabled={lines.length <= 1}
                          onClick={() => removeLine(idx)}
                          className="rounded-control p-1 text-ink-secondary hover:bg-subtle disabled:opacity-30"
                          style={{ color: 'var(--status-rose-text)' }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {insufficient && (
                      <div
                        className="mt-2 flex items-center gap-1.5 text-[11px] font-medium"
                        style={{ color: 'var(--status-rose-text)' }}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {isAr
                            ? `الكمية المطلوبة (${line.quantity}) تتجاوز المتاح بالمستودع (${available}).`
                            : `Requested (${line.quantity}) exceeds warehouse availability (${available}).`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 3: Discount & Tax */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-primary">
                {isAr ? 'قيمة الخصم ($)' : 'Discount Amount ($)'}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                dir="ltr"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                className="mono-tabular w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-primary">
                {isAr ? 'نسبة الضريبة (%)' : 'Tax Rate (%)'}
              </label>
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                dir="ltr"
                value={taxRatePct}
                onChange={(e) => setTaxRatePct(Math.min(50, Math.max(0, Number(e.target.value) || 0)))}
                className="mono-tabular w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* Sticky Financial Summary Footer */}
        <div className="border-t border-border bg-canvas px-5 py-4">
          <div className="grid grid-cols-2 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <span className="text-ink-secondary">{isAr ? 'المجموع الفرعي:' : 'Subtotal:'}</span>
              <div className="mono-tabular font-semibold text-ink-primary">
                ${financial.subtotal.toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-ink-secondary">{isAr ? 'الخصم:' : 'Discount:'}</span>
              <div className="mono-tabular font-medium text-ink-secondary">
                -${financial.discount.toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-ink-secondary">{isAr ? 'الضريبة:' : 'Tax:'}</span>
              <div className="mono-tabular font-medium text-ink-secondary">
                ${financial.tax.toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-ink-secondary">{isAr ? 'الإجمالي النهائي:' : 'Grand Total:'}</span>
              <div className="mono-tabular text-base font-bold text-primary">
                ${financial.total.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
            <span dir="ltr" className="mono-tabular hidden text-[10px] text-ink-secondary sm:inline">
              Idempotency-Key: {idempotencyKey.slice(0, 18)}…
            </span>
            <div className="ms-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-control border border-border bg-surface px-4 py-2 text-xs font-medium text-ink-primary hover:bg-subtle"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={
                  createMutation.isPending ||
                  !customerId ||
                  !warehouseId ||
                  lines.length === 0 ||
                  financial.hasStockError
                }
                onClick={() => createMutation.mutate()}
                className="rounded-control bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
              >
                {createMutation.isPending
                  ? isAr
                    ? 'جارٍ الحفظ والحجز...'
                    : 'Creating & Reserving...'
                  : isAr
                    ? 'تأكيد إنشاء الطلب'
                    : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
