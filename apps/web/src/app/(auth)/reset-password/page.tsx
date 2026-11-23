'use client';

import { Suspense, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, type ResetPasswordInput } from '@omni-ops/shared';
import { KeyRound, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locale } = useUi();
  const { pushToast } = useToast();
  const isAr = locale === 'ar';

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: searchParams.get('token') ?? '',
      newPassword: '',
    },
  });

  const onSubmit = async (values: ResetPasswordInput) => {
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: values,
        skipAuthRefresh: true,
      });
      pushToast({
        variant: 'success',
        title: isAr ? 'تم تعيين كلمة المرور' : 'Password reset complete',
        description: res.message,
      });
      router.replace('/login');
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Unable to reset password');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-6 text-start">
        <h1 className="text-xl font-bold text-ink-primary">
          {isAr ? 'تعيين كلمة مرور جديدة' : 'Set a new password'}
        </h1>
        <p className="mt-1 text-xs text-ink-secondary">
          {isAr
            ? 'سيتم إنهاء جميع الجلسات النشطة تلقائياً بعد إعادة التعيين.'
            : 'All active sessions will be automatically revoked upon reset.'}
        </p>

        {errorMsg && (
          <div
            className="mt-4 rounded-control border p-3 text-xs"
            style={{
              backgroundColor: 'var(--status-rose-bg)',
              color: 'var(--status-rose-text)',
              borderColor: 'var(--diff-before-border)',
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-primary">
              {isAr ? 'رمز الاستعادة (Token)' : 'Recovery Token'}
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-ink-secondary" />
              <input
                type="text"
                dir="ltr"
                {...register('token')}
                className="mono-tabular w-full rounded-control border border-border bg-canvas py-2 pe-3 ps-9 text-xs text-ink-primary outline-none focus:border-primary"
              />
            </div>
            {errors.token && (
              <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                {errors.token.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-primary">
              {isAr ? 'كلمة المرور الجديدة' : 'New Password'}
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-ink-secondary" />
              <input
                type="password"
                dir="ltr"
                placeholder="Min 8 chars, Upper, Lower, Number"
                {...register('newPassword')}
                className="w-full rounded-control border border-border bg-canvas py-2 pe-3 ps-9 text-sm text-ink-primary outline-none focus:border-primary"
              />
            </div>
            {errors.newPassword && (
              <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                {errors.newPassword.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-control bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
          >
            {isSubmitting
              ? isAr
                ? 'جارٍ الحفظ...'
                : 'Updating...'
              : isAr
                ? 'حفظ كلمة المرور الجديدة'
                : 'Update Password'}
          </button>

          <div className="text-center">
            <Link href="/login" className="text-xs font-medium text-ink-secondary hover:text-primary">
              {isAr ? 'العودة لتسجيل الدخول' : 'Return to Sign In'}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas">
          <div className="h-64 w-full max-w-md animate-pulse rounded-card bg-subtle" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
