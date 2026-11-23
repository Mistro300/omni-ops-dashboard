'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@omni-ops/shared';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useUi } from '@/providers/app-providers';

export default function ForgotPasswordPage() {
  const { locale } = useUi();
  const isAr = locale === 'ar';

  const [responseMsg, setResponseMsg] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (values: ForgotPasswordInput) => {
    setErrorMsg(null);
    setResponseMsg(null);
    setDevToken(null);
    try {
      const res = await apiFetch<{ message: string; devResetToken?: string }>(
        '/auth/forgot-password',
        {
          method: 'POST',
          body: values,
          skipAuthRefresh: true,
        },
      );
      setResponseMsg(res.message);
      if (res.devResetToken) {
        setDevToken(res.devResetToken);
      }
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Request failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-6 text-start">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {isAr ? 'العودة لتسجيل الدخول' : 'Back to Sign In'}
        </Link>

        <h1 className="mt-4 text-xl font-bold text-ink-primary">
          {isAr ? 'استعادة كلمة المرور' : 'Reset your password'}
        </h1>
        <p className="mt-1 text-xs text-ink-secondary">
          {isAr
            ? 'أدخل بريدك الإلكتروني لإصدار رمز إعادة تعيين صالح لمدة 30 دقيقة.'
            : 'Enter your account email to generate a 30-minute recovery token.'}
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

        {responseMsg && (
          <div
            className="mt-4 space-y-2 rounded-control border p-3 text-xs"
            style={{
              backgroundColor: 'var(--status-emerald-bg)',
              color: 'var(--status-emerald-text)',
              borderColor: 'var(--diff-after-border)',
            }}
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{responseMsg}</span>
            </div>
            {devToken && (
              <div className="rounded-control border border-border bg-surface p-2 text-ink-primary">
                <div className="text-[11px] font-semibold text-ink-secondary">
                  Development Reset Token:
                </div>
                <div className="mono-tabular mt-1 break-all text-[11px]">{devToken}</div>
                <Link
                  href={`/reset-password?token=${encodeURIComponent(devToken)}`}
                  className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
                >
                  {isAr ? 'الانتقال مباشرة لتعيين كلمة مرور جديدة →' : 'Proceed to Reset Password →'}
                </Link>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-primary">
              {isAr ? 'البريد الإلكتروني' : 'Email Address'}
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-ink-secondary" />
              <input
                type="email"
                dir="ltr"
                placeholder="admin@omniops.dev"
                {...register('email')}
                className="w-full rounded-control border border-border bg-canvas py-2 pe-3 ps-9 text-sm text-ink-primary outline-none focus:border-primary"
              />
            </div>
            {errors.email && (
              <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                {errors.email.message}
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
                ? 'جارٍ الإرسال...'
                : 'Sending...'
              : isAr
                ? 'إرسال رمز الاستعادة'
                : 'Send Reset Token'}
          </button>
        </form>
      </div>
    </div>
  );
}
