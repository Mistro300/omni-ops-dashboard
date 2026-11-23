'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changePasswordSchema,
  updateProfileSchema,
  type AuthUser,
  type ChangePasswordInput,
  type SessionInfo,
  type UpdateProfileInput,
} from '@omni-ops/shared';
import { KeyRound, Laptop, LogOut, ShieldAlert, Trash2, User } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuth, useUi } from '@/providers/app-providers';
import { useToast } from '@/providers/toast-provider';
import { getBadgeTokenStyles } from '@/styles/status-badges';

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const { locale } = useUi();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isAr = locale === 'ar';

  const [sessionToRevoke, setSessionToRevoke] = useState<SessionInfo | null>(null);

  const profileForm = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    values: {
      fullName: user?.fullName ?? '',
    },
  });

  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
    },
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: () => apiFetch<SessionInfo[]>('/auth/sessions'),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (dto: UpdateProfileInput) =>
      apiFetch<AuthUser>('/auth/profile', { method: 'PATCH', body: dto }),
    onSuccess: (updated) => {
      setUser(updated);
      pushToast({
        variant: 'success',
        title: isAr ? 'تم تحديث الملف الشخصي' : 'Profile updated',
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل تحديث الملف الشخصي' : 'Update failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (dto: ChangePasswordInput) =>
      apiFetch<{ message: string }>('/auth/change-password', { method: 'POST', body: dto }),
    onSuccess: (res) => {
      passwordForm.reset();
      void queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
      pushToast({
        variant: 'success',
        title: isAr ? 'تم تغيير كلمة المرور' : 'Password updated',
        description: res.message,
      });
    },
    onError: (err) => {
      pushToast({
        variant: 'error',
        title: isAr ? 'فشل تغيير كلمة المرور' : 'Password change failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    },
  });

  const revokeOneMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiFetch<{ revoked: boolean }>(`/auth/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setSessionToRevoke(null);
      void queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
      pushToast({
        variant: 'success',
        title: isAr ? 'تم إنهاء الجلسة بنجاح' : 'Session revoked',
      });
    },
  });

  const revokeOthersMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ revokedCount: number }>('/auth/sessions/revoke-others', { method: 'POST' }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
      pushToast({
        variant: 'success',
        title: isAr ? 'تم إنهاء الجلسات الأخرى' : 'Other sessions revoked',
        description: `${res.revokedCount} session(s) revoked`,
      });
    },
  });

  const currentStyle = getBadgeTokenStyles('emerald');

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-start">
      <div>
        <h1 className="text-xl font-bold text-ink-primary">
          {isAr ? 'إعدادات الحساب والأمان' : 'Account & Security Settings'}
        </h1>
        <p className="mt-1 text-xs text-ink-secondary">
          {isAr
            ? 'إدارة بيانات حسابك، كلمة المرور، والجلسات النشطة المرتبطة بـ Refresh Tokens.'
            : 'Manage your profile details, password, and active refresh token sessions.'}
        </p>
      </div>

      {/* Profile & Change Password Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Card */}
        <section className="rounded-card border border-border bg-surface p-5">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <User className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-ink-primary">
              {isAr ? 'البيانات الشخصية' : 'Profile Information'}
            </h2>
          </div>

          <form
            onSubmit={profileForm.handleSubmit((v) => updateProfileMutation.mutate(v))}
            className="mt-4 space-y-4"
          >
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
                {isAr ? 'البريد الإلكتروني' : 'Email'}
              </label>
              <input
                type="email"
                dir="ltr"
                disabled
                value={user?.email ?? ''}
                className="mono-tabular w-full rounded-control border border-border bg-subtle px-3 py-2 text-xs text-ink-secondary"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-primary">
                {isAr ? 'الاسم الكامل' : 'Full Name'}
              </label>
              <input
                type="text"
                {...profileForm.register('fullName')}
                className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-sm text-ink-primary outline-none focus:border-primary"
              />
              {profileForm.formState.errors.fullName && (
                <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                  {profileForm.formState.errors.fullName.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="rounded-control bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {updateProfileMutation.isPending
                ? isAr
                  ? 'جارٍ الحفظ...'
                  : 'Saving...'
                : isAr
                  ? 'حفظ التغييرات'
                  : 'Save Changes'}
            </button>
          </form>
        </section>

        {/* Change Password Card */}
        <section className="rounded-card border border-border bg-surface p-5">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <KeyRound className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-ink-primary">
              {isAr ? 'تغيير كلمة المرور' : 'Change Password'}
            </h2>
          </div>

          <form
            onSubmit={passwordForm.handleSubmit((v) => changePasswordMutation.mutate(v))}
            className="mt-4 space-y-4"
          >
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-primary">
                {isAr ? 'كلمة المرور الحالية' : 'Current Password'}
              </label>
              <input
                type="password"
                dir="ltr"
                {...passwordForm.register('currentPassword')}
                className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-sm text-ink-primary outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-primary">
                {isAr ? 'كلمة المرور الجديدة' : 'New Password'}
              </label>
              <input
                type="password"
                dir="ltr"
                {...passwordForm.register('newPassword')}
                className="w-full rounded-control border border-border bg-canvas px-3 py-2 text-sm text-ink-primary outline-none focus:border-primary"
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="mt-1 text-xs" style={{ color: 'var(--status-rose-text)' }}>
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="rounded-control bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {changePasswordMutation.isPending
                ? isAr
                  ? 'جارٍ التحديث...'
                  : 'Updating...'
                : isAr
                  ? 'تحديث كلمة المرور'
                  : 'Update Password'}
            </button>
          </form>
        </section>
      </div>

      {/* Active Sessions Table */}
      <section className="rounded-card border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Laptop className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-ink-primary">
              {isAr ? 'الجلسات النشطة (Active Sessions)' : 'Active Sessions'}
            </h2>
          </div>

          <button
            type="button"
            disabled={revokeOthersMutation.isPending || sessions.length <= 1}
            onClick={() => revokeOthersMutation.mutate()}
            className="inline-flex items-center gap-1.5 rounded-control border border-border bg-canvas px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-subtle disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            {isAr ? 'إنهاء جميع الجلسات الأخرى' : 'Revoke All Other Sessions'}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {sessionsLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-control bg-subtle" />
            ))
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center text-xs text-ink-secondary">
              {isAr ? 'لا توجد جلسات نشطة' : 'No active sessions found'}
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-canvas p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span dir="ltr" className="mono-tabular inline-block text-xs font-semibold text-ink-primary">
                      {session.ipAddress ?? 'Unknown IP'}
                    </span>
                    {session.isCurrent && (
                      <span className="status-pill" style={currentStyle.pill}>
                        <span className="status-dot" style={currentStyle.dot} />
                        {isAr ? 'الجلسة الحالية' : 'Current Session'}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 truncate text-xs text-ink-secondary">
                    {session.userAgent ?? 'Unknown Client'}
                  </div>
                  <div className="mono-tabular mt-1 text-[11px] text-ink-secondary">
                    Created: {new Date(session.createdAt).toLocaleString()} • Expires:{' '}
                    {new Date(session.expiresAt).toLocaleDateString()}
                  </div>
                </div>

                {!session.isCurrent && (
                  <button
                    type="button"
                    onClick={() => setSessionToRevoke(session)}
                    className="inline-flex items-center gap-1 rounded-control border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-subtle"
                    style={{ color: 'var(--status-rose-text)' }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {isAr ? 'إنهاء' : 'Revoke'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Delete / Revoke Confirmation Modal */}
      {sessionToRevoke && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSessionToRevoke(null)}
        >
          <div
            className="w-full max-w-sm rounded-card border border-border bg-surface p-5 text-start"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" style={{ color: 'var(--status-rose-dot)' }} />
              <h3 className="text-sm font-bold text-ink-primary">
                {isAr ? 'تأكيد إنهاء الجلسة' : 'Confirm Session Revocation'}
              </h3>
            </div>
            <p className="mt-2 text-xs text-ink-secondary">
              {isAr
                ? `هل تريد إنهاء الجلسة المرتبطة بعنوان ${sessionToRevoke.ipAddress}؟`
                : `Revoke active session from ${sessionToRevoke.ipAddress}?`}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSessionToRevoke(null)}
                className="rounded-control border border-border bg-canvas px-3 py-1.5 text-xs font-medium text-ink-primary hover:bg-subtle"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={revokeOneMutation.isPending}
                onClick={() => revokeOneMutation.mutate(sessionToRevoke.id)}
                className="rounded-control px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--status-rose-dot)' }}
              >
                {isAr ? 'تأكيد الإنهاء' : 'Confirm Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
