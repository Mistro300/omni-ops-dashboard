import { z } from 'zod';

export const BULK_ACTION_MAX_ITEMS = 100;

export const DEMO_ACCOUNTS = {
  ADMIN: {
    email: 'admin@omniops.dev',
    role: 'ADMIN',
    label: 'System Admin',
  },
  EDITOR: {
    email: 'editor@omniops.dev',
    role: 'EDITOR',
    label: 'Operations Editor',
  },
  VIEWER: {
    email: 'viewer@omniops.dev',
    role: 'VIEWER',
    label: 'Read-Only Viewer',
  },
} as const;

export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc');

export const offsetPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortDir: sortDirectionSchema,
  q: z.string().trim().max(120).optional(),
});

export const cursorPaginationQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(120).optional(),
});

export function createWhitelistedSortSchema<const T extends readonly [string, ...string[]]>(
  allowedFields: T,
  defaultField: T[number],
) {
  return z.enum(allowedFields).default(defaultField);
}

export const bulkIdsSchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, 'At least one item must be selected')
    .max(BULK_ACTION_MAX_ITEMS, `Bulk actions are limited to ${BULK_ACTION_MAX_ITEMS} items`),
});

export const bulkActionFailureSchema = z.object({
  id: z.string(),
  reason: z.string(),
});

export const bulkActionResultSchema = z.object({
  succeededIds: z.array(z.string()),
  failed: z.array(bulkActionFailureSchema),
});

export type OffsetPaginationQuery = z.infer<typeof offsetPaginationQuerySchema>;
export type CursorPaginationQuery = z.infer<typeof cursorPaginationQuerySchema>;
export type BulkActionFailure = z.infer<typeof bulkActionFailureSchema>;
export type BulkActionResult = z.infer<typeof bulkActionResultSchema>;
