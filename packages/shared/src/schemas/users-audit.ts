import { z } from 'zod';
import { ROLES, type UserRole } from '../rbac/permissions';
import { passwordPolicySchema } from './auth';
import {
  createWhitelistedSortSchema,
  cursorPaginationQuerySchema,
  offsetPaginationQuerySchema,
} from './common';

export const USER_SORT_FIELDS = ['fullName', 'email', 'role', 'status', 'lastLoginAt', 'createdAt'] as const;

export const usersQuerySchema = offsetPaginationQuerySchema.extend({
  sortBy: createWhitelistedSortSchema(USER_SORT_FIELDS, 'createdAt'),
  role: z.enum([ROLES.ADMIN, ROLES.EDITOR, ROLES.VIEWER]).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('Valid email is required').max(255),
  fullName: z.string().trim().min(2, 'Full name is required').max(160),
  role: z.enum([ROLES.ADMIN, ROLES.EDITOR, ROLES.VIEWER]),
  password: passwordPolicySchema,
});

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  role: z.enum([ROLES.ADMIN, ROLES.EDITOR, ROLES.VIEWER]).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

export const auditLogsQuerySchema = cursorPaginationQuerySchema.extend({
  actorId: z.string().uuid().optional(),
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export type UsersQuery = z.infer<typeof usersQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;

export interface UserListItemDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
  lastLoginAt: string | null;
  activeSessionsCount: number;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}
