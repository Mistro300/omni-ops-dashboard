'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  hasPermission,
  type AuthResponse,
  type AuthUser,
  type LoginInput,
  type Permission,
} from '@omni-ops/shared';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch, performSingleFlightRefresh, setAccessToken } from '@/lib/api-client';
import { ToastProvider } from './toast-provider';

export type Locale = 'ar' | 'en';
export type Theme = 'light' | 'dark';

interface UiContextValue {
  theme: Theme;
  toggleTheme: () => void;
  locale: Locale;
  dir: 'rtl' | 'ltr';
  toggleLocale: () => void;
  activeWarehouseId: string;
  setActiveWarehouseId: (id: string) => void;
}

interface AuthContextValue {
  user: AuthUser | null;
  isHydrating: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<AuthUser | null>;
  setUser: (user: AuthUser | null) => void;
  can: (permission: Permission) => boolean;
}

const UiContext = createContext<UiContextValue | null>(null);
const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_AUTH_ROUTES = ['/login', '/forgot-password', '/reset-password'];

function InnerProviders({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [theme, setTheme] = useState<Theme>('light');
  const [locale, setLocale] = useState<Locale>('ar');
  const [activeWarehouseId, setActiveWarehouseId] = useState<string>('ALL');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isHydrating, setIsHydrating] = useState<boolean>(true);

  // Restore saved theme & locale preferences
  useEffect(() => {
    const savedTheme = window.localStorage.getItem('omniops_theme') as Theme | null;
    const savedLocale = window.localStorage.getItem('omniops_locale') as Locale | null;
    if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme);
    if (savedLocale === 'ar' || savedLocale === 'en') setLocale(savedLocale);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem('omniops_theme', theme);
  }, [theme]);

  useEffect(() => {
    const dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
    window.localStorage.setItem('omniops_locale', locale);
  }, [locale]);

  // Hydrate auth session once on mount (skipping public auth pages when no user)
  useEffect(() => {
    let active = true;
    const isAuthRoute = PUBLIC_AUTH_ROUTES.some((r) => pathname?.startsWith(r));

    if (isAuthRoute) {
      setIsHydrating(false);
      return;
    }

    performSingleFlightRefresh()
      .then((res) => {
        if (!active) return;
        if (res?.user) {
          setUser(res.user);
        } else {
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setIsHydrating(false);
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale((l) => (l === 'ar' ? 'en' : 'ar'));
  }, []);

  const login = useCallback(async (input: LoginInput): Promise<AuthUser> => {
    const data = await apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: input,
      skipAuthRefresh: true,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST', skipAuthRefresh: true });
    } catch {
      // Clear local session even if server call fails
    } finally {
      setAccessToken(null);
      router.replace('/login');
      setUser(null);
    }
  }, [router]);

  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    const res = await performSingleFlightRefresh();
    if (res?.user) {
      setUser(res.user);
      return res.user;
    }
    setUser(null);
    return null;
  }, []);

  const can = useCallback(
    (permission: Permission) => {
      if (!user) return false;
      return hasPermission(user.role, permission);
    },
    [user],
  );

  const uiValue = useMemo<UiContextValue>(
    () => ({
      theme,
      toggleTheme,
      locale,
      dir: locale === 'ar' ? 'rtl' : 'ltr',
      toggleLocale,
      activeWarehouseId,
      setActiveWarehouseId,
    }),
    [theme, toggleTheme, locale, toggleLocale, activeWarehouseId],
  );

  const authValue = useMemo<AuthContextValue>(
    () => ({
      user,
      isHydrating,
      login,
      logout,
      refreshSession,
      setUser,
      can,
    }),
    [user, isHydrating, login, logout, refreshSession, can],
  );

  return (
    <UiContext.Provider value={uiValue}>
      <AuthContext.Provider value={authValue}>
        <ToastProvider>{children}</ToastProvider>
      </AuthContext.Provider>
    </UiContext.Provider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <InnerProviders>{children}</InnerProviders>
    </QueryClientProvider>
  );
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside AppProviders');
  return ctx;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AppProviders');
  return ctx;
}
