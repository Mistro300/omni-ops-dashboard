import { z } from 'zod';
import { EXPORT_FORMATS, EXPORT_STATUSES, type ExportFormat, type ExportStatus } from '../types/api';
import { offsetPaginationQuerySchema } from './common';

export const EXPORT_REPORT_TYPES = ['products', 'inventory', 'orders', 'stock_movements'] as const;
export type ExportReportType = (typeof EXPORT_REPORT_TYPES)[number];

export const EXPORT_SCOPES = ['current_page', 'all_filtered'] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

export const createExportSchema = z.object({
  reportType: z.enum(EXPORT_REPORT_TYPES),
  format: z.enum([EXPORT_FORMATS.XLSX, EXPORT_FORMATS.PDF]),
  scope: z.enum(EXPORT_SCOPES).default('all_filtered'),
  columns: z.array(z.string().min(1).max(64)).min(1).max(20).optional(),
  filters: z.record(z.unknown()).optional().default({}),
  forceAsync: z.boolean().optional().default(false),
});

export const exportJobsQuerySchema = offsetPaginationQuerySchema.extend({
  reportType: z.enum(EXPORT_REPORT_TYPES).optional(),
  status: z
    .enum([
      EXPORT_STATUSES.QUEUED,
      EXPORT_STATUSES.PROCESSING,
      EXPORT_STATUSES.COMPLETED,
      EXPORT_STATUSES.FAILED,
    ])
    .optional(),
});

export type CreateExportInput = z.infer<typeof createExportSchema>;
export type ExportJobsQuery = z.infer<typeof exportJobsQuerySchema>;

export interface ExportJobDto {
  id: string;
  requestedById: string;
  requestedByName: string;
  reportType: ExportReportType;
  format: ExportFormat;
  status: ExportStatus;
  rowCount: number | null;
  errorMessage: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  canDownload: boolean;
  createdAt: string;
}

export const REPORT_COLUMN_DEFINITIONS: Record<
  ExportReportType,
  readonly { key: string; labelEn: string; labelAr: string }[]
> = {
  products: [
    { key: 'sku', labelEn: 'SKU', labelAr: 'كود المنتج' },
    { key: 'name', labelEn: 'Product Name', labelAr: 'اسم المنتج' },
    { key: 'category', labelEn: 'Category', labelAr: 'التصنيف' },
    { key: 'unitCost', labelEn: 'Unit Cost', labelAr: 'التكلفة' },
    { key: 'unitPrice', labelEn: 'Unit Price', labelAr: 'سعر البيع' },
    { key: 'totalOnHand', labelEn: 'On Hand', labelAr: 'الرصيد الفعلي' },
    { key: 'totalAvailable', labelEn: 'Available', labelAr: 'المتاح' },
    { key: 'status', labelEn: 'Status', labelAr: 'الحالة' },
  ],
  inventory: [
    { key: 'sku', labelEn: 'SKU', labelAr: 'كود المنتج' },
    { key: 'productName', labelEn: 'Product', labelAr: 'المنتج' },
    { key: 'warehouseCode', labelEn: 'Warehouse', labelAr: 'المستودع' },
    { key: 'quantityOnHand', labelEn: 'On Hand', labelAr: 'الفعلي' },
    { key: 'quantityReserved', labelEn: 'Reserved', labelAr: 'المحجوز' },
    { key: 'quantityAvailable', labelEn: 'Available', labelAr: 'المتاح' },
    { key: 'reorderPoint', labelEn: 'Reorder Point', labelAr: 'حد إعادة الطلب' },
    { key: 'health', labelEn: 'Health', labelAr: 'حالة المخزون' },
  ],
  orders: [
    { key: 'orderNumber', labelEn: 'Order #', labelAr: 'رقم الطلب' },
    { key: 'customer', labelEn: 'Customer', labelAr: 'العميل' },
    { key: 'warehouseCode', labelEn: 'Warehouse', labelAr: 'المستودع' },
    { key: 'status', labelEn: 'Status', labelAr: 'الحالة' },
    { key: 'subtotal', labelEn: 'Subtotal', labelAr: 'المجموع الفرعي' },
    { key: 'taxAmount', labelEn: 'Tax', labelAr: 'الضريبة' },
    { key: 'totalAmount', labelEn: 'Total', labelAr: 'الإجمالي' },
    { key: 'createdAt', labelEn: 'Created At', labelAr: 'تاريخ الإنشاء' },
  ],
  stock_movements: [
    { key: 'createdAt', labelEn: 'Timestamp', labelAr: 'الوقت' },
    { key: 'sku', labelEn: 'SKU', labelAr: 'كود المنتج' },
    { key: 'warehouseCode', labelEn: 'Warehouse', labelAr: 'المستودع' },
    { key: 'type', labelEn: 'Type', labelAr: 'نوع الحركة' },
    { key: 'quantityDelta', labelEn: 'Delta', labelAr: 'التغير' },
    { key: 'balanceAfter', labelEn: 'Balance After', labelAr: 'الرصيد بعد' },
    { key: 'referenceId', labelEn: 'Reference', labelAr: 'المرجع' },
    { key: 'actor', labelEn: 'Actor', labelAr: 'المنفّذ' },
    { key: 'reason', labelEn: 'Reason', labelAr: 'السبب' },
  ],
};
