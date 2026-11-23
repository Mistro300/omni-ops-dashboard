import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission, UserRole } from '@omni-ops/shared';

export const IS_PUBLIC_KEY = 'omniops:isPublic';
export const REQUIRED_PERMISSIONS_KEY = 'omniops:requiredPermissions';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
  permissions: readonly Permission[];
  sessionId: string;
}

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
