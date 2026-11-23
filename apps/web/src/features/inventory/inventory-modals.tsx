'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adjustStockSchema,
  createWarehouseSchema,
  transferStockSchema,
  type AdjustStockInput,
  type CreateWarehouseInput,
  type InventoryLevelDto,
  type TransferStockInput,
  type WarehouseDto,
} from '@omni-ops/shared';
import { AlertTriangle, ArrowLeftRight, Building2, SlidersHorizontal, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';

export function StockAdjustmentModal({
  level,
  onClose,
}: {
  level: InventoryLevelDto | null;
  onClose: () => void;
}) {
  const { locale } = useUi();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isAr = locale === 'ar';

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<AdjustStockInput>({
    resolver: zodResolver(adjustStockSchema),
    defaultValues: {
      productId: level?.productId ?? '',
      warehouseId: level?.warehouseId ?? '',
      mode: 'ADD',
      quantity: 1,
      reason: '',
      reorderPoint: level?.reorderPoint ?? 10,
    },
  });

  useEffect(() => {
    if (!level) return;
    reset({
      productId: level.productId,
      warehouseId: level.warehouseId,
      mode: 'ADD',
      quantity: 1,
      reason: '',
      reorderPoint: level.reorderPoint,
    });
  }, [level, reset]);

  const mode = watch('mode');
  const quantity = Number(watch('quantity') || 0);
  const delta = mode === 'ADD' ? quantity : -quantity;
  const projectedOnHand = (level?.quantityOnHand ?? 0) + delta;
  const projectedAvailable = projectedOnHand - (level?.quantityReserved ?? 0);
  const violatesConstraint = projectedOnHand < 0 || projectedAvailable < 0;

  const mutation = useMutation({
    mutationFn: (dto: AdjustStockInput) =>
      apiFetch('/inventory/adjust', { method: 'POST', body: dto }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-levels'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product-detail'] });
      void queryClient.invalidateQueries({ queryKey: ['app-context'] });
      pushToast({
        variant: 'success',
        title: isAr ? 'تمت تسوية المخزون وتوثيق الحركة' : 'Stock adjusted & ledger recorded',
      });
      onClose();
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشلت تسوية المخزون' : 'Adjustment failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  if (!level) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-card border border-border bg-surface p-5 text-start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-ink-primary">
              {isAr ? 'تسوية رصيد المخزون' : 'Adjust Inventory Level'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="text-ink-secondary hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 rounded-control border border-border bg-subtle p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 font-semibold text-ink-primary">
            <span dir="ltr" className="mono-tabular inline-block whitespace-nowrap text-primary">
              {level.productSku}
            </span>
            <span>{level.productName}</span>
          </div>
          <div className="mt-1 text-ink-secondary">
            {level.warehouseCode} — {level.warehouseName}
          </div>
        </div>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="mt-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-primary">
                {isAr ? 'نوع التسوية' : 'Adjustment Mode'}
              </label>
              <select
                {...register('mode')}
                className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
              >
                <option value="ADD">{isAr ? 'إضافة (+)' : 'Add (+)'}</option>
                <option value="DEDUCT">{isAr ? 'خصم (-)' : 'Deduct (-)'}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-primary">
                {isAr ? 'الكمية' : 'Quantity'}
              </label>
              <input
                type="number"
                min="1"
                dir="ltr"
                {...register('quantity', { valueAsNumber: true })}
                className="mono-tabular w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
              />
            </div>
          </div>

          <div
            className="rounded-control border p-3 text-xs"
            style={{
              backgroundColor: violatesConstraint
                ? 'var(--status-rose-bg)'
                : 'var(--status-indigo-bg)',
              borderColor: violatesConstraint
                ? 'var(--diff-before-border)'
                : 'var(--color-border)',
              color: violatesConstraint ? 'var(--status-rose-text)' : 'var(--color-text-primary)',
            }}
          >
            <div className="flex items-center justify-between font-semibold">
              <span>{isAr ? 'الرصيد المتوقع بعد التسوية:' : 'Projected Balance After Adjustment:'}</span>
              <span dir="ltr" className="mono-tabular">
                {level.quantityOnHand} → {projectedOnHand}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] opacity-90">
              <span>
                {isAr ? `المحجوز: ${level.quantityReserved}` : `Reserved: ${level.quantityReserved}`}
              </span>
              <span>
                {isAr ? 'المتاح: ' : 'Available: '}
                <span dir="ltr" className="mono-tabular inline-block">
                  {level.quantityAvailable} → {projectedAvailable}
                </span>
              </span>
            </div>
            {violatesConstraint && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {isAr
                    ? 'لا يمكن أن يقل الرصيد الفعلي عن الكمية المحجوزة للطلبات!'
                    : 'Projected on-hand stock cannot fall below reserved quantity!'}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-primary">
              {isAr ? 'حد إعادة الطلب (اختياري)' : 'Reorder Point'}
            </label>
            <input
              type="number"
              min="0"
              dir="ltr"
              {...register('reorderPoint', { valueAsNumber: true })}
              className="mono-tabular w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-primary">
              {isAr ? 'سبب التسوية *' : 'Reason (Required) *'}
            </label>
            <textarea
              rows={2}
              placeholder={isAr ? 'مثال: جرد دوري / بضاعة تالفة / استلام مورد' : 'e.g. Cycle count reconciliation'}
              {...register('reason')}
              className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
            />
            {errors.reason && (
              <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                {errors.reason.message}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-border bg-canvas px-3.5 py-2 text-xs font-medium text-ink-primary hover:bg-subtle"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || violatesConstraint}
              className="rounded-control bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {mutation.isPending
                ? isAr
                  ? 'جارٍ التسوية...'
                  : 'Applying...'
                : isAr
                  ? 'تأكيد التسوية'
                  : 'Confirm Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function StockTransferModal({
  sourceLevel,
  warehouses,
  onClose,
}: {
  sourceLevel: InventoryLevelDto | null;
  warehouses: WarehouseDto[];
  onClose: () => void;
}) {
  const { locale } = useUi();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isAr = locale === 'ar';

  const destinationChoices = warehouses.filter(
    (w) => w.isActive && w.id !== sourceLevel?.warehouseId,
  );

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<TransferStockInput>({
    resolver: zodResolver(transferStockSchema),
    defaultValues: {
      productId: sourceLevel?.productId ?? '',
      fromWarehouseId: sourceLevel?.warehouseId ?? '',
      toWarehouseId: destinationChoices[0]?.id ?? '',
      quantity: 1,
      reason: '',
    },
  });

  useEffect(() => {
    if (!sourceLevel) return;
    reset({
      productId: sourceLevel.productId,
      fromWarehouseId: sourceLevel.warehouseId,
      toWarehouseId: destinationChoices[0]?.id ?? '',
      quantity: 1,
      reason: '',
    });
  }, [sourceLevel, reset]);

  const qty = Number(watch('quantity') || 0);
  const exceedsAvailable = qty > (sourceLevel?.quantityAvailable ?? 0);

  const mutation = useMutation({
    mutationFn: (dto: TransferStockInput) =>
      apiFetch<{ referenceId: string }>('/inventory/transfer', { method: 'POST', body: dto }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-levels'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['product-detail'] });
      void queryClient.invalidateQueries({ queryKey: ['app-context'] });
      pushToast({
        variant: 'success',
        title: isAr ? 'تم التحويل بين المستودعات بنجاح' : 'Transfer completed',
        description: `Ref: ${res.referenceId}`,
      });
      onClose();
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل التحويل بين المستودعات' : 'Transfer failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  if (!sourceLevel) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-card border border-border bg-surface p-5 text-start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-ink-primary">
              {isAr ? 'تحويل مخزون بين المستودعات' : 'Inter-Warehouse Stock Transfer'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="text-ink-secondary hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 rounded-control border border-border bg-subtle p-3 text-xs">
          <div className="font-semibold text-ink-primary">
            <span dir="ltr" className="mono-tabular me-1.5 inline-block text-primary">
              {sourceLevel.productSku}
            </span>
            {sourceLevel.productName}
          </div>
          <div className="mt-1 flex items-center justify-between text-ink-secondary">
            <span>
              {isAr ? 'المصدر:' : 'From:'} {sourceLevel.warehouseCode}
            </span>
            <span dir="ltr" className="mono-tabular font-semibold text-ink-primary">
              Available: {sourceLevel.quantityAvailable}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="mt-4 space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-primary">
              {isAr ? 'المستودع الوجهة *' : 'Destination Warehouse *'}
            </label>
            <select
              {...register('toWarehouseId')}
              className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
            >
              {destinationChoices.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.code} — {wh.name}
                </option>
              ))}
            </select>
            {errors.toWarehouseId && (
              <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                {errors.toWarehouseId.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-primary">
              {isAr ? 'الكمية المراد تحويلها *' : 'Transfer Quantity *'}
            </label>
            <input
              type="number"
              min="1"
              max={sourceLevel.quantityAvailable}
              dir="ltr"
              {...register('quantity', { valueAsNumber: true })}
              className="mono-tabular w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
            />
            {exceedsAvailable && (
              <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                {isAr
                  ? `الكمية تتجاوز الرصيد المتاح (${sourceLevel.quantityAvailable})`
                  : `Quantity exceeds available stock (${sourceLevel.quantityAvailable})`}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-primary">
              {isAr ? 'سبب التحويل / ملاحظات *' : 'Transfer Reason *'}
            </label>
            <textarea
              rows={2}
              placeholder={isAr ? 'مثال: إعادة توزيع المخزون لتغطية طلبات المنطقة' : 'Regional stock rebalancing'}
              {...register('reason')}
              className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
            />
            {errors.reason && (
              <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                {errors.reason.message}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-border bg-canvas px-3.5 py-2 text-xs font-medium text-ink-primary hover:bg-subtle"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || exceedsAvailable || sourceLevel.quantityAvailable <= 0}
              className="rounded-control bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {mutation.isPending
                ? isAr
                  ? 'جارٍ التحويل...'
                  : 'Transferring...'
                : isAr
                  ? 'تأكيد التحويل'
                  : 'Confirm Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface WarehouseFormValues {
  code: string;
  name: string;
  location: string;
  isActive?: boolean;
}

export function WarehouseModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: WarehouseDto | null;
  onClose: () => void;
}) {
  const { locale } = useUi();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isAr = locale === 'ar';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WarehouseFormValues, unknown, CreateWarehouseInput>({
    resolver: zodResolver(createWarehouseSchema),
    defaultValues: { code: '', name: '', location: '', isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      reset({
        code: editing.code,
        name: editing.name,
        location: editing.location,
        isActive: editing.isActive,
      });
    } else {
      reset({ code: '', name: '', location: '', isActive: true });
    }
  }, [open, editing, reset]);

  const mutation = useMutation({
    mutationFn: (dto: CreateWarehouseInput) =>
      editing
        ? apiFetch(`/warehouses/${editing.id}`, { method: 'PATCH', body: dto })
        : apiFetch('/warehouses', { method: 'POST', body: dto }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      void queryClient.invalidateQueries({ queryKey: ['app-context'] });
      pushToast({
        variant: 'success',
        title: editing
          ? isAr
            ? 'تم تحديث المستودع'
            : 'Warehouse updated'
          : isAr
            ? 'تم إنشاء المستودع بنجاح'
            : 'Warehouse created',
      });
      onClose();
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل حفظ المستودع' : 'Save failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-card border border-border bg-surface p-5 text-start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-ink-primary">
              {editing
                ? isAr
                  ? 'تعديل مستودع'
                  : 'Edit Warehouse'
                : isAr
                  ? 'إضافة مستودع جديد'
                  : 'New Warehouse'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="text-ink-secondary hover:text-ink-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="mt-4 space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-primary">
              {isAr ? 'كود المستودع *' : 'Warehouse Code *'}
            </label>
            <input
              type="text"
              dir="ltr"
              placeholder="WH-JED-06"
              {...register('code')}
              className="mono-tabular w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
            />
            {errors.code && (
              <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                {errors.code.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-primary">
              {isAr ? 'اسم المستودع *' : 'Warehouse Name *'}
            </label>
            <input
              type="text"
              placeholder="Jeddah Port Fulfillment Center"
              {...register('name')}
              className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-sm text-ink-primary outline-none focus:border-primary"
            />
            {errors.name && (
              <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                {errors.name.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-primary">
              {isAr ? 'الموقع *' : 'Location *'}
            </label>
            <input
              type="text"
              placeholder="Jeddah Islamic Port, SA"
              {...register('location')}
              className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-sm text-ink-primary outline-none focus:border-primary"
            />
            {errors.location && (
              <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                {errors.location.message}
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-primary">
            <input type="checkbox" {...register('isActive')} className="h-4 w-4 rounded accent-primary" />
            <span>{isAr ? 'مستودع نشط' : 'Warehouse is active'}</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-border bg-canvas px-3.5 py-2 text-xs font-medium text-ink-primary hover:bg-subtle"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-control bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {mutation.isPending ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : isAr ? 'حفظ' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
