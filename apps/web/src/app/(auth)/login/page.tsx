'use client';

import { Suspense, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { DEMO_ACCOUNTS, loginSchema, ROLES, type LoginInput } from '@omni-ops/shared';
import { AlertCircle, Globe, Lock, Mail, Moon, Shield, Sun } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/lib/api-client';
import { useAuth, useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';
import { getBadgeTokenStyles, ROLE_BADGE_TONE } from '@/styles/status-badges';

const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const DEMO_PASSWORD = 'OmniOps@2026!';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { theme, toggleTheme, locale, toggleLocale } = useUi();
  const { pushToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const isAr = locale === 'ar';
  const nextPath = searchParams.get('next') || '/overview';

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string; password: string; rememberMe?: boolean }, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (values: LoginInput) => {
    setServerError(null);
    try {
      const signedInUser = await login(values);
      pushToast({
        variant: 'success',
        title: isAr ? 'تم تسجيل الدخول بنجاح' : 'Signed in successfully',
        description: `${signedInUser.fullName} (${signedInUser.role})`,
      });
      router.replace(nextPath.startsWith('/') ? nextPath : '/overview');
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError(isAr ? 'تعذّر الاتصال بالخادم' : 'Unable to connect to authentication server');
      }
    }
  };

  const quickFill = (email: string) => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', DEMO_PASSWORD, { shouldValidate: true });
    setServerError(null);
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-canvas px-4 py-6">
      {/* Top Minimal Utility Bar */}
      <div className="mx-auto flex w-full max-w-md items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-control bg-primary text-xs font-bold text-primary-foreground">
            OO
          </div>
          <span className="text-sm font-bold text-ink-primary">OmniOps</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLocale}
            className="flex h-8 items-center gap-1 rounded-control border border-border bg-surface px-2.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
          >
            <Globe className="h-3.5 w-3.5" />
            <span className="mono-tabular">{locale === 'ar' ? 'EN' : 'AR'}</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-control border border-border bg-surface text-ink-secondary hover:text-ink-primary"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Main Auth Card */}
      <div className="mx-auto my-8 w-full max-w-md rounded-card border border-border bg-surface p-6 text-start">
        <div className="border-b border-border pb-4">
          <h1 className="text-xl font-bold text-ink-primary">
            {isAr ? 'تسجيل الدخول إلى OmniOps' : 'Sign in to OmniOps'}
          </h1>
          <p className="mt-1 text-xs text-ink-secondary">
            {isAr
              ? 'لوحة التحكم الإدارية لعمليات المخزون والمبيعات متعدد المستودعات'
              : 'Enterprise Multi-Warehouse Inventory & Order Operations'}
          </p>
        </div>

        {serverError && (
          <div
            className="mt-4 flex items-start gap-2 rounded-control border p-3 text-xs"
            style={{
              backgroundColor: 'var(--status-rose-bg)',
              color: 'var(--status-rose-text)',
              borderColor: 'var(--diff-before-border)',
            }}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{serverError}</span>
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
                autoComplete="email"
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

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-ink-primary">
                {isAr ? 'كلمة المرور' : 'Password'}
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
              >
                {isAr ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
              </Link>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-ink-secondary" />
              <input
                type="password"
                dir="ltr"
                autoComplete="current-password"
                placeholder="••••••••••••"
                {...register('password')}
                className="w-full rounded-control border border-border bg-canvas py-2 pe-3 ps-9 text-sm text-ink-primary outline-none focus:border-primary"
              />
            </div>
            {errors.password && (
              <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                {errors.password.message}
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-secondary">
            <input
              type="checkbox"
              {...register('rememberMe')}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span>{isAr ? 'تذكرني لمدة 30 يوماً' : 'Keep me signed in for 30 days'}</span>
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-control bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {isSubmitting
              ? isAr
                ? 'جارٍ التحقق...'
                : 'Signing in...'
              : isAr
                ? 'تسجيل الدخول'
                : 'Sign In'}
          </button>
        </form>

        {/* Demo Mode Quick-Fill Buttons (Only rendered when NEXT_PUBLIC_DEMO_MODE=true) */}
        {IS_DEMO_MODE && (
          <div className="mt-6 border-t border-border pt-4">
            <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-ink-secondary">
              <Shield className="h-3.5 w-3.5 text-primary" />
              <span>
                {isAr
                  ? 'حسابات تجريبية سريعة (Demo Mode)'
                  : 'Quick-Fill Portfolio Demo Accounts'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(DEMO_ACCOUNTS).map((account) => {
                const roleStyle = getBadgeTokenStyles(ROLE_BADGE_TONE[ROLES[account.role]]);
                return (
                  <button
                    key={account.role}
                    type="button"
                    onClick={() => quickFill(account.email)}
                    className="flex flex-col items-start rounded-control border border-border bg-canvas p-2 text-start transition-colors hover:border-primary hover:bg-subtle"
                  >
                    <span className="status-pill" style={roleStyle.pill}>
                      <span className="status-dot" style={roleStyle.dot} />
                      {account.role}
                    </span>
                    <span className="mono-tabular mt-1.5 w-full truncate text-[10px] text-ink-secondary">
                      {account.email}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-xs text-ink-secondary">
        OmniOps — Argon2id + Rotating Refresh Tokens + RBAC
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas">
          <div className="h-64 w-full max-w-md animate-pulse rounded-card bg-subtle" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
