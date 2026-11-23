export interface OffsetPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface OffsetPaginatedResponse<T> {
  data: T[];
  meta: OffsetPaginationMeta;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  path?: string;
  timestamp: string;
}

export const EXPORT_FORMATS = {
  XLSX: 'XLSX',
  PDF: 'PDF',
} as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[keyof typeof EXPORT_FORMATS];

export const EXPORT_STATUSES = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type ExportStatus = (typeof EXPORT_STATUSES)[keyof typeof EXPORT_STATUSES];

export const NOTIFICATION_TYPES = {
  LOW_STOCK: 'LOW_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  EXPORT_READY: 'EXPORT_READY',
  EXPORT_FAILED: 'EXPORT_FAILED',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];
