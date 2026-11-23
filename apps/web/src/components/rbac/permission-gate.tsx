'use client';

import { useEffect, type ReactNode } from 'react';
import type { Permission } from '@omni-ops/shared';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/app-providers';

interface PermissionGateProps {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const { can } = useAuth();
  if (!can(permission)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}

interface RoutePermissionGuardProps {
  permission: Permission;
  children: ReactNode;
}

export function RoutePermissionGuard({ permission, children }: RoutePermissionGuardProps) {
  const { user, isHydrating, can } = useAuth();
  const router = useRouter();

  const allowed = can(permission);

  useEffect(() => {
    if (!isHydrating && user && !allowed) {
      router.replace('/403');
    }
  }, [isHydrating, user, allowed, router]);

  if (isHydrating || !user) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-control bg-subtle" />
        <div className="h-44 w-full animate-pulse rounded-card bg-subtle" />
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
