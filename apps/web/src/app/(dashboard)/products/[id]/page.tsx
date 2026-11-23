'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PERMISSIONS,
  type InventoryLevelDto,
  type ProductDetailDto,
  type StockMovementType,
  type WarehouseDto,
} from '@omni-ops/shared';
import { ArrowLeft, ArrowLeftRight, Building2, History, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PermissionGate, RoutePermissionGuard } from '@/components/rbac/permission-gate';
import { StockAdjustmentModal, StockTransferModal } from '@/features/inventory/inventory-modals';
import { apiFetch } from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';
import {
  getBadgeTokenStyles,
  INVENTORY_STATUS_TONE,
  MOVEMENT_TYPE_TONE,
} from '@/styles/status-badges';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const { locale } = useUi();
  const isAr = locale === 'ar';

  const [adjustTarget, setAdjustTarget] = useState<InventoryLevelDto | null>(null);
  const [transferTarget, setTransferTarget] = useState<InventoryLevelDto | null>(null);

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product-detail', params.id],
    queryFn: () => apiFetch<ProductDetailDto>(`/products/${params.id}`),
    enabled: Boolean(params.id),
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => apiFetch<WarehouseDto[]>('/warehouses'),
  });

  const toLevelDto = (
    item: ProductDetailDto['inventoryByWarehouse'][number],
  ): InventoryLevelDto => ({
    id: item.id,
    productId: product!.id,
    productSku: product!.sku,
    productName: product!.name,
    warehouseId: item.warehouseId,
    warehouseCode: item.warehouseCode,
    warehouseName: item.warehouseName,
    quantityOnHand: item.quantityOnHand,
    quantityReserved: item.quantityReserved,
    quantityAvailable: item.quantityAvailable,
    reorderPoint: item.reorderPoint,
    stockHealth: item.stockHealth,
    version: 1,
    updatedAt: item.updatedAt,
  });

  return (
    <RoutePermissionGuard permission={PERMISSIONS.PRODUCTS_READ}>
      <div className="space-y-6 text-start">
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {isAr ? 'العودة إلى دليل المنتجات' : 'Back to Products Catalog'}
        </Link>

        {isLoading ? (
          <div className="space-y-4">
            <div className="h-28 animate-pulse rounded-card bg-subtle" />
            <div className="h-56 animate-pulse rounded-card bg-subtle" />
          </div>
        ) : error || !product ? (
          <div className="rounded-card border border-border bg-surface p-6 text-sm text-ink-secondary">
            {isAr ? 'المنتج غير موجود أو تم حذفه.' : 'Product not found.'}
          </div>
        ) : (
          <>
            <div className="rounded-card border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span dir="ltr" className="mono-tabular text-xs font-semibold text-primary">
                      {product.sku}
                    </span>
                    <span
                      className="status-pill"
                      style={getBadgeTokenStyles(product.isActive ? 'emerald' : 'zinc').pill}
                    >
                      <span
                        className="status-dot"
                        style={getBadgeTokenStyles(product.isActive ? 'emerald' : 'zinc').dot}
                      />
                      {product.isActive ? (isAr ? 'نشط' : 'Active') : isAr ? 'معطّل' : 'Inactive'}
                    </span>
                    <span className="text-xs text-ink-secondary">{product.categoryName}</span>
                  </div>
                  <h1 className="mt-2 text-xl font-bold text-ink-primary">{product.name}</h1>
                </div>

                <div className="grid grid-cols-3 gap-4 rounded-control border border-border bg-canvas px-4 py-2.5 text-xs">
                  <div>
                    <div className="text-ink-secondary">{isAr ? 'التكلفة' : 'Cost'}</div>
                    <div className="mono-tabular mt-0.5 font-semibold text-ink-primary">
                      ${product.unitCost.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-ink-secondary">{isAr ? 'السعر' : 'Price'}</div>
                    <div className="mono-tabular mt-0.5 font-semibold text-ink-primary">
                      ${product.unitPrice.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-ink-secondary">{isAr ? 'إجمالي المتاح' : 'Total Avail.'}</div>
                    <div dir="ltr" className="mono-tabular mt-0.5 font-semibold text-primary">
                      {product.totalAvailable} / {product.totalOnHand}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <section className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Building2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-ink-primary">
                  {isAr ? 'توزيع المخزون حسب المستودع' : 'Stock Distribution by Warehouse'}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-start text-xs">
                  <thead>
                    <tr className="border-b border-border bg-subtle text-ink-secondary">
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'المستودع' : 'Warehouse'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'الفعلي' : 'On Hand'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'المحجوز' : 'Reserved'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'المتاح' : 'Available'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'حد الطلب' : 'Reorder Pt.'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'الحالة' : 'Health'}</th>
                      <th className="px-4 py-2.5 text-end font-semibold">{isAr ? 'إجراءات' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.inventoryByWarehouse.map((wh) => {
                      const hs = getBadgeTokenStyles(INVENTORY_STATUS_TONE[wh.stockHealth]);
                      return (
                        <tr key={wh.id} className="h-[44px] border-b border-border last:border-b-0">
                          <td className="whitespace-nowrap px-3 font-medium text-ink-primary">
                            <span dir="ltr" className="mono-tabular me-1.5 inline-block whitespace-nowrap text-ink-secondary">
                              {wh.warehouseCode}
                            </span>
                            {wh.warehouseName}
                          </td>
                          <td className="mono-tabular whitespace-nowrap px-3">{wh.quantityOnHand}</td>
                          <td className="mono-tabular whitespace-nowrap px-3 text-ink-secondary">{wh.quantityReserved}</td>
                          <td className="mono-tabular whitespace-nowrap px-3 font-semibold">{wh.quantityAvailable}</td>
                          <td className="mono-tabular whitespace-nowrap px-3 text-ink-secondary">{wh.reorderPoint}</td>
                          <td className="whitespace-nowrap px-3">
                            <span className="status-pill" style={hs.pill}>
                              <span className="status-dot" style={hs.dot} />
                              {wh.stockHealth}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 text-end">
                            <div className="inline-flex items-center gap-1">
                              <PermissionGate permission={PERMISSIONS.INVENTORY_ADJUST}>
                                <button
                                  type="button"
                                  onClick={() => setAdjustTarget(toLevelDto(wh))}
                                  className="inline-flex items-center gap-1 rounded-control border border-border bg-canvas px-2 py-1 text-[11px] font-medium text-ink-primary hover:bg-subtle"
                                >
                                  <SlidersHorizontal className="h-3 w-3" />
                                  {isAr ? 'تسوية' : 'Adjust'}
                                </button>
                              </PermissionGate>
                              <PermissionGate permission={PERMISSIONS.INVENTORY_TRANSFER}>
                                <button
                                  type="button"
                                  disabled={wh.quantityAvailable <= 0}
                                  onClick={() => setTransferTarget(toLevelDto(wh))}
                                  className="inline-flex items-center gap-1 rounded-control border border-border bg-canvas px-2 py-1 text-[11px] font-medium text-ink-primary hover:bg-subtle disabled:opacity-40"
                                >
                                  <ArrowLeftRight className="h-3 w-3" />
                                  {isAr ? 'تحويل' : 'Transfer'}
                                </button>
                              </PermissionGate>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-card border border-border bg-surface">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <History className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-ink-primary">
                  {isAr ? 'آخر الحركات المخزنية لهذا المنتج' : 'Recent Stock Movements'}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-start text-xs">
                  <thead>
                    <tr className="border-b border-border bg-subtle text-ink-secondary">
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'الوقت' : 'Timestamp'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'المستودع' : 'Warehouse'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'النوع' : 'Type'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'التغير' : 'Delta'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'الرصيد بعد' : 'Balance After'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'المرجع' : 'Reference'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'المنفّذ' : 'Actor'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.recentMovements.map((m) => {
                      const tone = MOVEMENT_TYPE_TONE[m.type as StockMovementType] ?? 'zinc';
                      const ms = getBadgeTokenStyles(tone);
                      return (
                        <tr key={m.id} className="h-[40px] border-b border-border last:border-b-0">
                          <td className="mono-tabular px-4 text-ink-secondary">
                            {new Date(m.createdAt).toLocaleString()}
                          </td>
                          <td className="mono-tabular px-4">{m.warehouseCode}</td>
                          <td className="px-4">
                            <span className="status-pill" style={ms.pill}>
                              <span className="status-dot" style={ms.dot} />
                              {m.type}
                            </span>
                          </td>
                          <td className="mono-tabular px-4 font-semibold" style={{ color: ms.pill.color }}>
                            {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                          </td>
                          <td className="mono-tabular px-4 font-medium">{m.balanceAfter}</td>
                          <td className="mono-tabular px-4 text-ink-secondary">
                            {m.referenceId ?? '—'}
                          </td>
                          <td className="px-4 text-ink-secondary">{m.actorName}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <StockAdjustmentModal level={adjustTarget} onClose={() => setAdjustTarget(null)} />
        <StockTransferModal
          sourceLevel={transferTarget}
          warehouses={warehouses}
          onClose={() => setTransferTarget(null)}
        />
      </div>
    </RoutePermissionGuard>
  );
}
