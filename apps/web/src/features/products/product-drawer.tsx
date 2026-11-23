'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createProductSchema,
  type CategoryDto,
  type CreateProductInput,
  type ProductListItemDto,
} from '@omni-ops/shared';
import { X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';

interface ProductDrawerProps {
  open: boolean;
  onClose: () => void;
  categories: CategoryDto[];
  editingProduct: ProductListItemDto | null;
}

interface ProductFormValues {
  sku: string;
  name: string;
  categoryId: string;
  unitCost: number;
  unitPrice: number;
  isActive?: boolean;
  defaultReorderPoint?: number;
}

export function ProductDrawer({
  open,
  onClose,
  categories,
  editingProduct,
}: ProductDrawerProps) {
  const { locale } = useUi();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isAr = locale === 'ar';

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProductFormValues, unknown, CreateProductInput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      sku: '',
      name: '',
      categoryId: categories[0]?.id ?? '',
      unitCost: 0,
      unitPrice: 0,
      isActive: true,
      defaultReorderPoint: 10,
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editingProduct) {
      reset({
        sku: editingProduct.sku,
        name: editingProduct.name,
        categoryId: editingProduct.categoryId,
        unitCost: editingProduct.unitCost,
        unitPrice: editingProduct.unitPrice,
        isActive: editingProduct.isActive,
        defaultReorderPoint: 10,
      });
    } else {
      reset({
        sku: '',
        name: '',
        categoryId: categories[0]?.id ?? '',
        unitCost: 0,
        unitPrice: 0,
        isActive: true,
        defaultReorderPoint: 10,
      });
    }
  }, [open, editingProduct, categories, reset]);

  const unitCost = Number(watch('unitCost') || 0);
  const unitPrice = Number(watch('unitPrice') || 0);
  const grossMarginPct =
    unitPrice > 0 ? (((unitPrice - unitCost) / unitPrice) * 100).toFixed(1) : '0.0';

  const mutation = useMutation({
    mutationFn: (values: CreateProductInput) => {
      if (editingProduct) {
        const { defaultReorderPoint: _unused, ...updateBody } = values;
        return apiFetch(`/products/${editingProduct.id}`, {
          method: 'PATCH',
          body: updateBody,
        });
      }
      return apiFetch('/products', { method: 'POST', body: values });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-levels'] });
      pushToast({
        variant: 'success',
        title: editingProduct
          ? isAr
            ? 'تم تحديث المنتج بنجاح'
            : 'Product updated'
          : isAr
            ? 'تم إنشاء المنتج وتهيئة المستودعات'
            : 'Product created across active warehouses',
      });
      onClose();
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل حفظ المنتج' : 'Failed to save product',
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
        className="flex h-full w-full max-w-[540px] flex-col border-s border-border bg-surface text-start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-ink-primary">
              {editingProduct
                ? isAr
                  ? 'تعديل بيانات المنتج'
                  : 'Edit Product'
                : isAr
                  ? 'إضافة منتج جديد'
                  : 'Create New Product'}
            </h2>
            <p className="mt-0.5 text-xs text-ink-secondary">
              {editingProduct
                ? editingProduct.sku
                : isAr
                  ? 'سيتم تهيئة صفوف المخزون تلقائياً في جميع المستودعات النشطة.'
                  : 'Inventory rows will be automatically initialized for all active warehouses.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1.5 text-ink-secondary hover:bg-subtle hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit((vals) => mutation.mutate(vals))}
          className="flex flex-1 flex-col overflow-y-auto"
        >
          <div className="flex-1 space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-primary">SKU *</label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="SKU-0501"
                  {...register('sku')}
                  className="mono-tabular w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
                />
                {errors.sku && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                    {errors.sku.message}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-primary">
                  {isAr ? 'التصنيف *' : 'Category *'}
                </label>
                <select
                  {...register('categoryId')}
                  className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-xs text-ink-primary outline-none focus:border-primary"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                {errors.categoryId && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                    {errors.categoryId.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-primary">
                {isAr ? 'اسم المنتج *' : 'Product Name *'}
              </label>
              <input
                type="text"
                placeholder={isAr ? 'مثال: ProBook Enterprise Gen 4' : 'e.g. ProBook Enterprise Gen 4'}
                {...register('name')}
                className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-sm text-ink-primary outline-none focus:border-primary"
              />
              {errors.name && (
                <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-primary">
                  {isAr ? 'سعر التكلفة (Unit Cost)' : 'Unit Cost ($)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  dir="ltr"
                  {...register('unitCost', { valueAsNumber: true })}
                  className="mono-tabular w-full rounded-control border border-border bg-canvas px-3 py-2 text-sm text-ink-primary outline-none focus:border-primary"
                />
                {errors.unitCost && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                    {errors.unitCost.message}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-primary">
                  {isAr ? 'سعر البيع (Unit Price)' : 'Unit Price ($)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  dir="ltr"
                  {...register('unitPrice', { valueAsNumber: true })}
                  className="mono-tabular w-full rounded-control border border-border bg-canvas px-3 py-2 text-sm text-ink-primary outline-none focus:border-primary"
                />
                {errors.unitPrice && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                    {errors.unitPrice.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-control border border-border bg-subtle px-3.5 py-2.5 text-xs">
              <span className="text-ink-secondary">
                {isAr ? 'هامش الربح التقديري للوحدة:' : 'Estimated Gross Margin:'}
              </span>
              <span dir="ltr" className="mono-tabular font-semibold text-ink-primary">
                ${(unitPrice - unitCost).toFixed(2)} ({grossMarginPct}%)
              </span>
            </div>

            {!editingProduct && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-primary">
                  {isAr ? 'حد إعادة الطلب الافتراضي للمستودعات' : 'Default Reorder Point'}
                </label>
                <input
                  type="number"
                  min="0"
                  dir="ltr"
                  {...register('defaultReorderPoint', { valueAsNumber: true })}
                  className="mono-tabular w-full rounded-control border border-border bg-canvas px-3 py-2 text-sm text-ink-primary outline-none focus:border-primary"
                />
              </div>
            )}

            <label className="flex cursor-pointer items-center gap-2 rounded-control border border-border bg-canvas p-3 text-xs text-ink-primary">
              <input
                type="checkbox"
                {...register('isActive')}
                className="h-4 w-4 rounded accent-primary"
              />
              <span>
                {isAr ? 'المنتج نشط ومتاح للطلبات' : 'Product is active and available for orders'}
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border bg-canvas px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-border bg-surface px-4 py-2 text-xs font-medium text-ink-primary hover:bg-subtle"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-control bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {mutation.isPending
                ? isAr
                  ? 'جارٍ الحفظ...'
                  : 'Saving...'
                : editingProduct
                  ? isAr
                    ? 'حفظ التعديلات'
                    : 'Save Changes'
                  : isAr
                    ? 'إنشاء المنتج'
                    : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
