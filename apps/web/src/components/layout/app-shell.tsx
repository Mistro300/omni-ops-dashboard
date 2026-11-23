'use client';

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PERMISSIONS, type Permission } from '@omni-ops/shared';
import {
  BarChart3,
  Bell,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileClock,
  Globe,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useAuth, useUi } from '@/providers/app-providers';
import { getBadgeTokenStyles, ROLE_BADGE_TONE } from '@/styles/status-badges';

interface NavItem {
  href: string;
  labelAr: string;
  labelEn: string;
  icon: ComponentType<{ className?: string }>;
  permission?: Permission;
}

interface NavGroup {
  id: string;
  titleAr: string;
  titleEn: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'main',
    titleAr: 'الرئيسية',
    titleEn: 'Overview',
    items: [
      {
        href: '/overview',
        labelAr: 'لوحة المؤشرات',
        labelEn: 'Dashboard',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: 'operations',
    titleAr: 'العمليات',
    titleEn: 'Operations',
    items: [
      {
        href: '/products',
        labelAr: 'المنتجات',
        labelEn: 'Products',
        icon: Package,
        permission: PERMISSIONS.PRODUCTS_READ,
      },
      {
        href: '/inventory',
        labelAr: 'المخزون والمستودعات',
        labelEn: 'Inventory & Warehouses',
        icon: Boxes,
        permission: PERMISSIONS.INVENTORY_READ,
      },
      {
        href: '/orders',
        labelAr: 'الطلبات',
        labelEn: 'Orders',
        icon: ShoppingCart,
        permission: PERMISSIONS.ORDERS_READ,
      },
      {
        href: '/customers',
        labelAr: 'العملاء',
        labelEn: 'Customers',
        icon: Users,
        permission: PERMISSIONS.CUSTOMERS_READ,
      },
    ],
  },
  {
    id: 'reports',
    titleAr: 'التقارير',
    titleEn: 'Analytics',
    items: [
      {
        href: '/analytics',
        labelAr: 'التحليلات والتصدير',
        labelEn: 'Analytics & Exports',
        icon: BarChart3,
        permission: PERMISSIONS.ANALYTICS_READ,
      },
    ],
  },
  {
    id: 'admin',
    titleAr: 'الإدارة',
    titleEn: 'Administration',
    items: [
      {
        href: '/users',
        labelAr: 'المستخدمون والصلاحيات',
        labelEn: 'Users & Roles',
        icon: ShieldCheck,
        permission: PERMISSIONS.USERS_MANAGE,
      },
      {
        href: '/audit',
        labelAr: 'سجل التدقيق',
        labelEn: 'Audit Logs',
        icon: FileClock,
        permission: PERMISSIONS.AUDIT_READ,
      },
    ],
  },
];

interface AppContextPayload {
  warehouses: Array<{ id: string; code: string; name: string; location: string }>;
  notifications: Array<{
    id: string;
    type: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'EXPORT_READY' | 'EXPORT_FAILED';
    title: string;
    message: string;
    readAt: string | null;
    createdAt: string;
  }>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isHydrating, logout, can } = useAuth();
  const { theme, toggleTheme, locale, dir, toggleLocale, activeWarehouseId, setActiveWarehouseId } =
    useUi();

  const [collapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTab, setNotifTab] = useState<'stock' | 'exports'>('stock');
  const [accountOpen, setAccountOpen] = useState(false);

  const isAr = locale === 'ar';

  // Redirect to login if hydration completed without an active user
  useEffect(() => {
    if (!isHydrating && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/overview')}`);
    }
  }, [isHydrating, user, router, pathname]);

  // Global Command Search keyboard shortcut (Ctrl+K / Cmd+K)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setCommandOpen(false);
        setNotifOpen(false);
        setAccountOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const { data: appContext, refetch: refetchContext } = useQuery({
    queryKey: ['app-context'],
    queryFn: () => apiFetch<AppContextPayload>('/auth/context'),
    enabled: Boolean(user),
  });

  const markAllRead = async () => {
    try {
      await apiFetch('/auth/notifications/mark-all-read', { method: 'POST' });
      void refetchContext();
    } catch {
      // Ignore transient failures
    }
  };

  const visibleGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || can(item.permission)),
    })).filter((group) => group.items.length > 0);
  }, [can]);

  const flatCommandItems = useMemo(() => {
    const all = visibleGroups.flatMap((g) => g.items);
    const withSettings: NavItem[] = [
      ...all,
      {
        href: '/settings',
        labelAr: 'إعدادات الحساب والأمان',
        labelEn: 'Account & Security Settings',
        icon: Settings,
      },
    ];
    if (!commandQuery.trim()) return withSettings;
    const q = commandQuery.toLowerCase();
    return withSettings.filter(
      (item) =>
        item.labelAr.toLowerCase().includes(q) ||
        item.labelEn.toLowerCase().includes(q) ||
        item.href.toLowerCase().includes(q),
    );
  }, [visibleGroups, commandQuery]);

  const activePageMeta = useMemo(() => {
    for (const g of NAV_GROUPS) {
      for (const item of g.items) {
        if (pathname?.startsWith(item.href)) {
          return {
            group: isAr ? g.titleAr : g.titleEn,
            page: isAr ? item.labelAr : item.labelEn,
          };
        }
      }
    }
    if (pathname?.startsWith('/settings')) {
      return {
        group: isAr ? 'الحساب' : 'Account',
        page: isAr ? 'إعدادات الحساب والأمان' : 'Account & Security',
      };
    }
    return {
      group: 'OmniOps',
      page: isAr ? 'لوحة التحكم' : 'Dashboard',
    };
  }, [pathname, isAr]);

  const stockNotifications = (appContext?.notifications ?? []).filter(
    (n) => n.type === 'LOW_STOCK' || n.type === 'OUT_OF_STOCK',
  );
  const exportNotifications = (appContext?.notifications ?? []).filter(
    (n) => n.type === 'EXPORT_READY' || n.type === 'EXPORT_FAILED',
  );
  const unreadCount = (appContext?.notifications ?? []).filter((n) => !n.readAt).length;

  if (isHydrating || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-md space-y-3 rounded-card border border-border bg-surface p-6">
          <div className="h-5 w-40 animate-pulse rounded-control bg-subtle" />
          <div className="h-4 w-64 animate-pulse rounded-control bg-subtle" />
          <div className="h-24 w-full animate-pulse rounded-card bg-subtle" />
        </div>
      </div>
    );
  }

  const roleStyle = getBadgeTokenStyles(ROLE_BADGE_TONE[user.role]);
  const CollapseIcon =
    dir === 'rtl'
      ? collapsed
        ? ChevronLeft
        : ChevronRight
      : collapsed
        ? ChevronRight
        : ChevronLeft;

  return (
    <div className="flex min-h-screen bg-canvas text-ink-primary">
      {/* Sidebar (256px / 68px) */}
      <aside
        className={cn(
          'sticky top-0 flex h-screen shrink-0 flex-col border-e border-border bg-surface transition-[width] duration-200',
          collapsed ? 'w-[68px]' : 'w-[256px]',
        )}
      >
        {/* Brand Header */}
        <div className="flex h-[60px] items-center justify-between border-b border-border px-3.5">
          <Link href="/overview" className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-primary text-xs font-bold text-primary-foreground">
              OO
            </div>
            {!collapsed && (
              <div className="min-w-0 text-start">
                <div className="truncate text-sm font-bold tracking-tight text-ink-primary">
                  OmniOps
                </div>
                <div className="truncate text-[11px] text-ink-secondary">
                  {isAr ? 'عمليات المخزون والمبيعات' : 'Enterprise Ops'}
                </div>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-control border border-border bg-canvas p-1 text-ink-secondary hover:text-ink-primary"
            aria-label="Toggle sidebar"
          >
            <CollapseIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
          {visibleGroups.map((group) => (
            <div key={group.id}>
              {!collapsed && (
                <div className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary text-start">
                  {isAr ? group.titleAr : group.titleEn}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? (isAr ? item.labelAr : item.labelEn) : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm font-medium transition-colors',
                          active
                            ? 'bg-primary-soft text-primary'
                            : 'text-ink-secondary hover:bg-subtle hover:text-ink-primary',
                          collapsed && 'justify-center px-0',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <span className="truncate">{isAr ? item.labelAr : item.labelEn}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Bottom User Card with Role Badge */}
        <div className="border-t border-border p-3">
          <Link
            href="/settings"
            className={cn(
              'flex items-center gap-2.5 rounded-control border border-border bg-canvas p-2 transition-colors hover:bg-subtle',
              collapsed && 'justify-center border-transparent bg-transparent p-1',
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-subtle text-xs font-semibold text-ink-primary">
              {user.fullName.slice(0, 2).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 text-start">
                <div className="truncate text-xs font-semibold text-ink-primary">
                  {user.fullName}
                </div>
                <div className="mt-1">
                  <span className="status-pill" style={roleStyle.pill}>
                    <span className="status-dot" style={roleStyle.dot} />
                    {user.role}
                  </span>
                </div>
              </div>
            )}
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky Topbar (60px) */}
        <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between gap-3 border-b border-border bg-surface px-5">
          {/* Breadcrumbs */}
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-ink-secondary sm:inline">{activePageMeta.group}</span>
            <span className="hidden text-ink-secondary sm:inline">/</span>
            <span className="truncate font-semibold text-ink-primary">{activePageMeta.page}</span>
          </div>

          {/* Right/End Controls */}
          <div className="flex items-center gap-2">
            {/* Global Command Search (⌘K) */}
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex items-center gap-2 rounded-control border border-border bg-canvas px-3 py-1.5 text-xs text-ink-secondary hover:border-primary hover:text-ink-primary"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden md:inline">
                {isAr ? 'بحث سريع...' : 'Quick search...'}
              </span>
              <kbd className="mono-tabular rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-ink-secondary">
                ⌘K
              </kbd>
            </button>

            {/* Warehouse Switcher */}
            <div className="hidden items-center gap-1.5 rounded-control border border-border bg-canvas px-2.5 py-1.5 lg:flex">
              <Building2 className="h-3.5 w-3.5 text-ink-secondary" />
              <select
                aria-label="Active Warehouse"
                value={activeWarehouseId}
                onChange={(e) => setActiveWarehouseId(e.target.value)}
                className="bg-transparent text-xs font-medium text-ink-primary outline-none"
              >
                <option value="ALL" className="bg-surface text-ink-primary">
                  {isAr ? 'جميع المستودعات' : 'All Warehouses'}
                </option>
                {(appContext?.warehouses ?? []).map((wh) => (
                  <option key={wh.id} value={wh.id} className="bg-surface text-ink-primary">
                    {wh.code} — {wh.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Notifications Bell Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((o) => !o);
                  setAccountOpen(false);
                }}
                className="relative flex h-8 w-8 items-center justify-center rounded-control border border-border bg-canvas text-ink-secondary hover:text-ink-primary"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span
                    className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill px-1 text-[10px] font-bold text-white"
                    style={{ backgroundColor: 'var(--status-rose-dot)' }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute end-0 top-10 z-40 w-80 rounded-card border border-border bg-surface p-3 text-start">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="text-xs font-semibold text-ink-primary">
                      {isAr ? 'الإشعارات والتنبيهات' : 'Notifications'}
                    </span>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={() => void markAllRead()}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          {isAr ? 'قراءة الكل' : 'Mark all read'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="text-ink-secondary hover:text-ink-primary"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded-control bg-subtle p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setNotifTab('stock')}
                      className={cn(
                        'rounded-control py-1 font-medium',
                        notifTab === 'stock'
                          ? 'bg-surface text-ink-primary'
                          : 'text-ink-secondary',
                      )}
                    >
                      {isAr ? `نقص المخزون (${stockNotifications.length})` : `Stock (${stockNotifications.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotifTab('exports')}
                      className={cn(
                        'rounded-control py-1 font-medium',
                        notifTab === 'exports'
                          ? 'bg-surface text-ink-primary'
                          : 'text-ink-secondary',
                      )}
                    >
                      {isAr ? `التصدير (${exportNotifications.length})` : `Exports (${exportNotifications.length})`}
                    </button>
                  </div>
                  <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                    {(notifTab === 'stock' ? stockNotifications : exportNotifications).length ===
                    0 ? (
                      <div className="py-6 text-center text-xs text-ink-secondary">
                        {isAr ? 'لا توجد إشعارات حالياً' : 'No notifications'}
                      </div>
                    ) : (
                      (notifTab === 'stock' ? stockNotifications : exportNotifications).map((n) => (
                        <div
                          key={n.id}
                          className="rounded-control border border-border bg-canvas p-2.5"
                        >
                          <div className="text-xs font-semibold text-ink-primary">{n.title}</div>
                          <p className="mt-0.5 text-[11px] text-ink-secondary">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                  {notifTab === 'exports' && (
                    <div className="mt-2 border-t border-border pt-2 text-center">
                      <Link
                        href="/analytics#exports"
                        onClick={() => setNotifOpen(false)}
                        className="text-[11px] font-semibold text-primary hover:underline"
                      >
                        {isAr ? 'فتح مركز مهام التصدير' : 'Open Export Jobs Center'}
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-control border border-border bg-canvas text-ink-secondary hover:text-ink-primary"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Locale / Direction Toggle */}
            <button
              type="button"
              onClick={toggleLocale}
              className="flex h-8 items-center gap-1 rounded-control border border-border bg-canvas px-2 text-xs font-medium text-ink-secondary hover:text-ink-primary"
              aria-label="Toggle language"
            >
              <Globe className="h-3.5 w-3.5" />
              <span className="mono-tabular">{locale === 'ar' ? 'EN' : 'AR'}</span>
            </button>

            {/* Account Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setAccountOpen((o) => !o);
                  setNotifOpen(false);
                }}
                className="flex h-8 items-center gap-2 rounded-control border border-border bg-canvas px-2.5 text-xs font-medium text-ink-primary hover:bg-subtle"
              >
                <span className="hidden max-w-[120px] truncate sm:inline">{user.fullName}</span>
                <span className="mono-tabular text-[11px] text-ink-secondary">{user.role}</span>
              </button>

              {accountOpen && (
                <div className="absolute end-0 top-10 z-40 w-56 rounded-card border border-border bg-surface p-1.5 text-start">
                  <div className="border-b border-border px-2.5 py-2 text-start">
                    <div className="truncate text-xs font-semibold text-ink-primary">
                      {user.fullName}
                    </div>
                    <div className="truncate text-[11px] text-ink-secondary">
                      <span dir="ltr" className="mono-tabular inline-block">
                        {user.email}
                      </span>
                    </div>
                  </div>
                  <Link
                    href="/settings"
                    onClick={() => setAccountOpen(false)}
                    className="mt-1 flex items-center gap-2 rounded-control px-2.5 py-2 text-xs text-ink-primary hover:bg-subtle"
                  >
                    <Settings className="h-3.5 w-3.5 text-ink-secondary" />
                    {isAr ? 'إعدادات الحساب والأمان' : 'Account & Security'}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      void logout();
                    }}
                    className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-xs hover:bg-subtle"
                    style={{ color: 'var(--status-rose-text)' }}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    {isAr ? 'تسجيل الخروج' : 'Sign Out'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 p-5 md:p-6">{children}</main>
      </div>

      {/* Global Command Palette Modal (⌘K) */}
      {commandOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-20"
          onClick={() => setCommandOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-card border border-border bg-surface p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border pb-2.5">
              <Search className="h-4 w-4 text-ink-secondary" />
              <input
                autoFocus
                type="text"
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder={isAr ? 'ابحث للانتقال إلى أي شاشة...' : 'Jump to any page...'}
                className="w-full bg-transparent text-sm text-ink-primary outline-none placeholder:text-ink-secondary"
              />
              <button
                type="button"
                onClick={() => setCommandOpen(false)}
                className="rounded-control p-1 text-ink-secondary hover:bg-subtle"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {flatCommandItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-ink-secondary">
                  {isAr ? 'لا توجد نتائج مطابقة' : 'No matching destinations'}
                </div>
              ) : (
                flatCommandItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => {
                        setCommandOpen(false);
                        setCommandQuery('');
                        router.push(item.href);
                      }}
                      className="flex w-full items-center justify-between rounded-control px-3 py-2 text-start text-sm text-ink-primary hover:bg-subtle"
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-ink-secondary" />
                        <span>{isAr ? item.labelAr : item.labelEn}</span>
                      </span>
                      <span className="mono-tabular text-xs text-ink-secondary">{item.href}</span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[11px] text-ink-secondary">
              <span className="flex items-center gap-1">
                <ClipboardList className="h-3 w-3" />
                {isAr ? 'الأوامر متاحة حسب صلاحيات دورك الحالي' : 'Filtered by your active RBAC role'}
              </span>
              <span className="mono-tabular">ESC</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
