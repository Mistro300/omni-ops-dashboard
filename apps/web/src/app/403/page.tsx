import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-6 text-center">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-card"
          style={{
            backgroundColor: 'var(--status-rose-bg)',
            color: 'var(--status-rose-text)',
          }}
        >
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div className="mono-tabular mt-4 text-xs font-semibold text-ink-secondary">ERROR 403</div>
        <h1 className="mt-1 text-xl font-bold text-ink-primary">
          غير مصرح لك بالوصول (Access Forbidden)
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">
          دورك الحالي لا يمتلك الصلاحية المطلوبة لفتح هذه الصفحة. تواصل مع مسؤول النظام في حال الحاجة
          لترقية الصلاحيات.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/overview"
            className="rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            العودة للوحة الرئيسية
          </Link>
        </div>
      </div>
    </main>
  );
}
