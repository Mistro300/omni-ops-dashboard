'use client';

import type { Permission } from '@omni-ops/shared';
import { RoutePermissionGuard } from '@/components/rbac/permission-gate';
import { useUi } from '@/providers/app-providers';

export function PhasePlaceholder({
  permission,
  titleAr,
  titleEn,
  phaseLabel,
}: {
  permission: Permission;
  titleAr: string;
  titleEn: string;
  phaseLabel: string;
}) {
  const { locale } = useUi();
  const isAr = locale === 'ar';

  return (
    <RoutePermissionGuard permission={permission}>
      <div className="rounded-card border border-border bg-surface p-6 text-start">
        <span className="mono-tabular rounded-control border border-border bg-subtle px-2 py-0.5 text-xs text-ink-secondary">
          {phaseLabel}
        </span>
        <h1 className="mt-3 text-lg font-bold text-ink-primary">{isAr ? titleAr : titleEn}</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {isAr
            ? `المسار محمي بصلاحية ${permission} وجاهز للتنفيذ الكامل في ${phaseLabel}.`
            : `Route is protected by ${permission} and ready for full implementation in ${phaseLabel}.`}
        </p>
      </div>
    </RoutePermissionGuard>
  );
}
