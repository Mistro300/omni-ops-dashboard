import { z } from 'zod';
import type { Permission, UserRole } from '../rbac/permissions';

export const passwordPolicySchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
  .regex(/[a-z]/, 'Password must include at least one lowercase letter')
  .regex(/[0-9]/, 'Password must include at least one number');

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required').max(128),
  rememberMe: z.boolean().optional().default(false),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(16, 'Invalid reset token'),
  newPassword: passwordPolicySchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordPolicySchema,
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(160),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
  permissions: readonly Permission[];
  lastLoginAt: string | null;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}
