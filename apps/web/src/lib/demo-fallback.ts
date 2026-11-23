import {
  ROLE_PERMISSIONS,
  ROLES,
  type AnalyticsOverviewDto,
  type AuditLogDto,
  type AuthUser,
  type CategoryDto,
  type CursorPaginatedResponse,
  type CustomerListItemDto,
  type ExportJobDto,
  type InventoryLevelDto,
  type OffsetPaginatedResponse,
  type OrderDetailDto,
  type OrderListItemDto,
  type OrderStatus,
  type ProductDetailDto,
  type ProductListItemDto,
  type SessionInfo,
  type StockMovementDto,
  type UserListItemDto,
  type UserRole,
  type WarehouseDto,
} from '@omni-ops/shared';

const DEMO_WAREHOUSES: WarehouseDto[] = [
  {
    id: 'w-cai-01',
    code: 'WH-CAI-01',
    name: 'مستودع القاهرة الرئيسي — Cairo Central Fulfillment Hub',
    location: 'القاهرة، مصر (Cairo, Egypt)',
    isActive: true,
    skuCount: 500,
    totalUnits: 48250,
    createdAt: '2026-01-10T08:00:00.000Z',
  },
  {
    id: 'w-alx-02',
    code: 'WH-ALX-02',
    name: 'مركز الإسكندرية اللوجستي — Alexandria Port Logistics Center',
    location: 'الإسكندرية، مصر (Alexandria, Egypt)',
    isActive: true,
    skuCount: 500,
    totalUnits: 34120,
    createdAt: '2026-01-12T08:00:00.000Z',
  },
  {
    id: 'w-ruh-03',
    code: 'WH-RUH-03',
    name: 'مستودع الرياض الإقليمي — Riyadh Regional Distribution Hub',
    location: 'الرياض، السعودية (Riyadh, KSA)',
    isActive: true,
    skuCount: 500,
    totalUnits: 51900,
    createdAt: '2026-01-15T08:00:00.000Z',
  },
  {
    id: 'w-dxb-04',
    code: 'WH-DXB-04',
    name: 'مستودع جبل علي — Dubai Jebel Ali Freezone Hub',
    location: 'دبي، الإمارات (Dubai, UAE)',
    isActive: true,
    skuCount: 500,
    totalUnits: 44800,
    createdAt: '2026-01-18T08:00:00.000Z',
  },
  {
    id: 'w-jed-05',
    code: 'WH-JED-05',
    name: 'بوابة البحر الأحمر — Jeddah Red Sea Gateway',
    location: 'جدة، السعودية (Jeddah, KSA)',
    isActive: true,
    skuCount: 500,
    totalUnits: 29400,
    createdAt: '2026-01-20T08:00:00.000Z',
  },
];

const DEMO_CATEGORIES: CategoryDto[] = [
  { id: 'cat-01', name: 'Industrial Sensors', slug: 'industrial-sensors', parentId: null, isActive: true, productCount: 84 },
  { id: 'cat-02', name: 'Networking & Gateways', slug: 'networking-gateways', parentId: null, isActive: true, productCount: 76 },
  { id: 'cat-03', name: 'CCTV & Security', slug: 'cctv-security', parentId: null, isActive: true, productCount: 68 },
  { id: 'cat-04', name: 'Power Supplies', slug: 'power-supplies', parentId: null, isActive: true, productCount: 54 },
  { id: 'cat-05', name: 'Cables & Wiring', slug: 'cables-wiring', parentId: null, isActive: true, productCount: 92 },
  { id: 'cat-06', name: 'Control Panels', slug: 'control-panels', parentId: null, isActive: true, productCount: 126 },
];

const PRODUCT_SEED_Templates = [
  { sku: 'PRD-2026-0001', name: 'حساس صناعي لاسلكي', categoryId: 'cat-01', categoryName: 'Industrial Sensors', unitCost: 45, unitPrice: 75, onHand: 200, reserved: 50, health: 'IN_STOCK' as const },
  { sku: 'PRD-2026-0012', name: 'بوابة شبكة ذكية', categoryId: 'cat-02', categoryName: 'Networking & Gateways', unitCost: 120, unitPrice: 190, onHand: 50, reserved: 0, health: 'IN_STOCK' as const },
  { sku: 'PRD-2026-0023', name: 'كاميرا مراقبة خارجية', categoryId: 'cat-03', categoryName: 'CCTV & Security', unitCost: 140, unitPrice: 240, onHand: 100, reserved: 0, health: 'IN_STOCK' as const },
  { sku: 'PRD-2026-0034', name: 'محول طاقة مستمر', categoryId: 'cat-04', categoryName: 'Power Supplies', unitCost: 35, unitPrice: 55, onHand: 50, reserved: 47, health: 'LOW_STOCK' as const },
  { sku: 'PRD-2026-0045', name: 'كابل توصيل ألياف', categoryId: 'cat-05', categoryName: 'Cables & Wiring', unitCost: 25, unitPrice: 45, onHand: 120, reserved: 115, health: 'LOW_STOCK' as const },
  { sku: 'PRD-2026-0058', name: 'لوحة تحكم ذكية', categoryId: 'cat-06', categoryName: 'Control Panels', unitCost: 110, unitPrice: 180, onHand: 0, reserved: 0, health: 'OUT_OF_STOCK' as const },
];

const DEMO_PRODUCTS: ProductListItemDto[] = Array.from({ length: 24 }, (_, idx) => {
  const tpl = PRODUCT_SEED_Templates[idx % PRODUCT_SEED_Templates.length]!;
  const num = idx + 1;
  const sku = idx < PRODUCT_SEED_Templates.length ? tpl.sku : `PRD-2026-${String(num).padStart(4, '0')}`;
  const name = idx < PRODUCT_SEED_Templates.length ? tpl.name : `${tpl.name} الجيل ${num}`;
  const totalAvailable = Math.max(0, tpl.onHand - tpl.reserved);
  return {
    id: `prd-demo-${String(num).padStart(4, '0')}`,
    sku,
    name,
    categoryId: tpl.categoryId,
    categoryName: tpl.categoryName,
    unitCost: tpl.unitCost,
    unitPrice: tpl.unitPrice,
    isActive: idx !== 11,
    totalOnHand: tpl.onHand,
    totalReserved: tpl.reserved,
    totalAvailable,
    stockHealth: tpl.health,
    updatedAt: '2026-11-23T15:30:00.000Z',
  };
});

const ORDER_TEMPLATES: Array<{
  orderNumber: string;
  customerName: string;
  company: string;
  whIdx: number;
  items: number;
  total: number;
  status: OrderStatus;
  date: string;
}> = [
  { orderNumber: 'ORD-2026-18848', customerName: 'أحمد محمد', company: 'مجموعة الفطيم', whIdx: 0, items: 3, total: 145.0, status: 'DELIVERED', date: '2026-11-23T14:20:00.000Z' },
  { orderNumber: 'ORD-2026-18847', customerName: 'سارة أحمد', company: 'اتصالات', whIdx: 2, items: 1, total: 89.5, status: 'SHIPPED', date: '2026-11-23T12:10:00.000Z' },
  { orderNumber: 'ORD-2026-18846', customerName: 'خالد عبد الله', company: 'شركة الخريف', whIdx: 3, items: 5, total: 430.0, status: 'CONFIRMED', date: '2026-11-22T18:40:00.000Z' },
  { orderNumber: 'ORD-2026-18845', customerName: 'فاطمة علي', company: 'مجموعة الفوزان', whIdx: 1, items: 2, total: 55.0, status: 'PENDING', date: '2026-11-22T11:15:00.000Z' },
  { orderNumber: 'ORD-2026-18844', customerName: 'محمد حسن', company: 'صناعات الغانم', whIdx: 4, items: 10, total: 1200.0, status: 'DELIVERED', date: '2026-11-21T16:30:00.000Z' },
  { orderNumber: 'ORD-2026-18843', customerName: 'ياسمين فهد', company: 'بنك دبي الإسلامي', whIdx: 0, items: 4, total: 18.5, status: 'CANCELLED', date: '2026-11-21T09:50:00.000Z' },
  { orderNumber: 'ORD-2026-18842', customerName: 'علي عمر', company: 'مجموعة الفطيم', whIdx: 2, items: 2, total: 112.4, status: 'REFUNDED', date: '2026-11-20T15:00:00.000Z' },
];

const DEMO_ORDERS: OrderListItemDto[] = Array.from({ length: 20 }, (_, idx) => {
  const tpl = ORDER_TEMPLATES[idx % ORDER_TEMPLATES.length]!;
  const wh = DEMO_WAREHOUSES[tpl.whIdx]!;
  const subtotal = Number((tpl.total / 1.14).toFixed(2));
  const taxAmount = Number((tpl.total - subtotal).toFixed(2));
  return {
    id: `ord-demo-${String(idx + 1).padStart(4, '0')}`,
    orderNumber: idx < ORDER_TEMPLATES.length ? tpl.orderNumber : `ORD-2026-${18848 - idx}`,
    customerId: `cust-demo-${(idx % 6) + 1}`,
    customerName: tpl.customerName,
    customerCompany: tpl.company,
    warehouseId: wh.id,
    warehouseCode: wh.code,
    warehouseName: wh.name,
    status: tpl.status,
    itemCount: tpl.items,
    subtotal,
    discountAmount: 0,
    taxAmount,
    totalAmount: tpl.total,
    createdAt: tpl.date,
    updatedAt: tpl.date,
  };
});

function buildDemoUser(email?: string): AuthUser {
  const lower = (email ?? 'admin@omniops.dev').toLowerCase();
  const role: UserRole = lower.includes('viewer')
    ? ROLES.VIEWER
    : lower.includes('editor')
      ? ROLES.EDITOR
      : ROLES.ADMIN;
  const savedCustomName =
    typeof window !== 'undefined' && role === ROLES.ADMIN
      ? window.localStorage.getItem('omniops_cf_demo_fullname')
      : null;
  const fullName =
    savedCustomName ||
    (role === ROLES.ADMIN
      ? 'Mohamed Bahaa'
      : role === ROLES.EDITOR
        ? 'أحمد السيد'
        : 'سارة محمود');

  return {
    id: `usr-demo-${role.toLowerCase()}`,
    email: lower,
    fullName,
    role,
    status: 'ACTIVE',
    permissions: [...ROLE_PERMISSIONS[role]],
    lastLoginAt: new Date().toISOString(),
  };
}

let activeDemoUser: AuthUser = buildDemoUser('admin@omniops.dev');

export function resolveCloudflareDemoFallback<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): T {
  const cleanPath = path.split('?')[0] ?? path;
  const method = (options.method ?? 'GET').toUpperCase();

  if (cleanPath === '/auth/login' && method === 'POST') {
    const body = (options.body ?? {}) as { email?: string };
    activeDemoUser = buildDemoUser(body.email);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('omniops_cf_logged_out');
      window.sessionStorage.setItem('omniops_cf_demo_email', activeDemoUser.email);
    }
    return {
      accessToken: `cf-pages-demo-token-${activeDemoUser.role.toLowerCase()}`,
      user: activeDemoUser,
    } as T;
  }

  if (cleanPath === '/auth/logout' && method === 'POST') {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('omniops_cf_logged_out', '1');
    }
    return { loggedOut: true } as T;
  }

  if (cleanPath === '/auth/refresh' && method === 'POST') {
    if (typeof window !== 'undefined') {
      if (window.sessionStorage.getItem('omniops_cf_logged_out') === '1') {
        throw new Error('Logged out of demo session');
      }
      const savedEmail = window.sessionStorage.getItem('omniops_cf_demo_email');
      if (savedEmail) {
        activeDemoUser = buildDemoUser(savedEmail);
      }
    }
    return {
      accessToken: `cf-pages-demo-token-${activeDemoUser.role.toLowerCase()}`,
      user: activeDemoUser,
    } as T;
  }

  if (cleanPath === '/auth/me') {
    return activeDemoUser as T;
  }

  if (cleanPath === '/auth/profile' && method === 'PATCH') {
    const body = (options.body ?? {}) as { fullName?: string };
    const nextName = body.fullName?.trim() || activeDemoUser.fullName;
    activeDemoUser = {
      ...activeDemoUser,
      fullName: nextName,
    };
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('omniops_cf_demo_fullname', nextName);
    }
    return activeDemoUser as T;
  }

  if (cleanPath === '/auth/change-password' && method === 'POST') {
    return { message: 'تم تحديث كلمة المرور بنجاح (Password updated)' } as T;
  }

  if (cleanPath === '/auth/forgot-password' && method === 'POST') {
    return {
      message: 'تم إنشاء رمز استعادة كلمة المرور',
      resetToken: 'demo-reset-token-2026',
    } as T;
  }

  if (cleanPath === '/auth/reset-password' && method === 'POST') {
    return { reset: true } as T;
  }

  if (cleanPath === '/auth/sessions/revoke-others' && method === 'POST') {
    return { revokedCount: 1 } as T;
  }

  if (cleanPath.startsWith('/auth/sessions/') && method === 'DELETE') {
    return { revoked: true } as T;
  }

  if (cleanPath === '/auth/context') {
    return {
      warehouses: DEMO_WAREHOUSES,
      notifications: [
        {
          id: 'notif-1',
          type: 'LOW_STOCK',
          title: 'تنبيه نقص مخزون — WH-CAI-01',
          message: 'PRD-2026-0001 وصل إلى الحد الحرج (0 متاح / 15 حد إعادة الطلب).',
          readAt: null,
          createdAt: new Date(Date.now() - 1800_000).toISOString(),
        },
        {
          id: 'notif-2',
          type: 'EXPORT_READY',
          title: 'اكتمل تصدير الطلبات (orders_2026.xlsx)',
          message: 'تمت معالجة 25,003 صف بنجاح. الملف متاح للتنزيل لمدة 24 ساعة.',
          readAt: null,
          createdAt: new Date(Date.now() - 3600_000).toISOString(),
        },
      ],
    } as T;
  }

  if (cleanPath === '/auth/notifications/mark-all-read' && method === 'POST') {
    return { updatedCount: 2 } as T;
  }

  if (cleanPath === '/auth/sessions') {
    const sessions: SessionInfo[] = [
      {
        id: 'sess-cf-1',
        userAgent:
          typeof navigator !== 'undefined' ? navigator.userAgent : 'Cloudflare Pages Browser',
        ipAddress: '197.54.12.88',
        createdAt: new Date(Date.now() - 3600_000).toISOString(),
        expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
        isCurrent: true,
      },
    ];
    return sessions as T;
  }

  if (cleanPath === '/categories') {
    return DEMO_CATEGORIES as T;
  }

  if (cleanPath === '/warehouses') {
    if (method === 'POST') {
      const b = (options.body ?? {}) as Partial<WarehouseDto>;
      const created: WarehouseDto = {
        id: `w-custom-${Date.now()}`,
        code: (b.code ?? 'WH-NEW-06').toUpperCase(),
        name: b.name ?? 'مستودع إقليمي جديد',
        location: b.location ?? 'القاهرة، مصر',
        isActive: b.isActive ?? true,
        skuCount: 500,
        totalUnits: 12500,
        createdAt: new Date().toISOString(),
      };
      DEMO_WAREHOUSES.unshift(created);
      return created as T;
    }
    return DEMO_WAREHOUSES as T;
  }

  if (cleanPath.startsWith('/warehouses/') && method === 'PATCH') {
    const id = cleanPath.replace('/warehouses/', '');
    const b = (options.body ?? {}) as Partial<WarehouseDto>;
    const idx = DEMO_WAREHOUSES.findIndex((w) => w.id === id);
    if (idx !== -1) {
      DEMO_WAREHOUSES[idx] = { ...DEMO_WAREHOUSES[idx]!, ...b };
      return DEMO_WAREHOUSES[idx] as T;
    }
    return DEMO_WAREHOUSES[0] as T;
  }

  if (cleanPath === '/products/bulk-status' && method === 'POST') {
    const b = (options.body ?? {}) as { ids?: string[]; isActive?: boolean };
    const ids = b.ids ?? [];
    for (const p of DEMO_PRODUCTS) {
      if (ids.includes(p.id) && typeof b.isActive === 'boolean') {
        p.isActive = b.isActive;
      }
    }
    return { succeededIds: ids, failed: [] } as T;
  }

  if (cleanPath === '/products') {
    if (method === 'POST') {
      const b = (options.body ?? {}) as Partial<ProductListItemDto>;
      const cat = DEMO_CATEGORIES.find((c) => c.id === b.categoryId) ?? DEMO_CATEGORIES[0]!;
      const created: ProductListItemDto = {
        id: `prd-custom-${Date.now()}`,
        sku: (b.sku ?? `PRD-2026-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase(),
        name: b.name ?? 'منتج صناعي جديد',
        categoryId: cat.id,
        categoryName: cat.name,
        unitCost: Number(b.unitCost ?? 50),
        unitPrice: Number(b.unitPrice ?? 85),
        isActive: b.isActive ?? true,
        totalOnHand: 100,
        totalReserved: 0,
        totalAvailable: 100,
        stockHealth: 'IN_STOCK',
        updatedAt: new Date().toISOString(),
      };
      DEMO_PRODUCTS.unshift(created);
      return created as T;
    }
    const response: OffsetPaginatedResponse<ProductListItemDto> = {
      data: DEMO_PRODUCTS,
      meta: {
        total: 500,
        page: 1,
        limit: 20,
        totalPages: 25,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    };
    return response as T;
  }

  if (cleanPath.startsWith('/products/')) {
    const id = cleanPath.replace('/products/', '');
    const idx = DEMO_PRODUCTS.findIndex((p) => p.id === id);
    if (method === 'PATCH') {
      const b = (options.body ?? {}) as Partial<ProductListItemDto>;
      if (idx !== -1) {
        DEMO_PRODUCTS[idx] = { ...DEMO_PRODUCTS[idx]!, ...b, updatedAt: new Date().toISOString() };
        return DEMO_PRODUCTS[idx] as T;
      }
      return DEMO_PRODUCTS[0] as T;
    }
    if (method === 'DELETE') {
      if (idx !== -1) DEMO_PRODUCTS.splice(idx, 1);
      return { deleted: true } as T;
    }
    const found = DEMO_PRODUCTS[idx] ?? DEMO_PRODUCTS[0]!;
    const detail: ProductDetailDto = {
      ...found,
      createdAt: '2026-02-01T10:00:00.000Z',
      inventoryByWarehouse: DEMO_WAREHOUSES.map((w, i) => ({
        id: `il-${w.id}`,
        warehouseId: w.id,
        warehouseCode: w.code,
        warehouseName: w.name,
        quantityOnHand: 45 + i * 12,
        quantityReserved: 5,
        quantityAvailable: 40 + i * 12,
        reorderPoint: 15,
        stockHealth: 'IN_STOCK',
        updatedAt: new Date().toISOString(),
      })),
      recentMovements: [
        {
          id: 'mv-1',
          warehouseCode: 'WH-CAI-01',
          type: 'IN',
          quantityDelta: 1200,
          balanceAfter: 1400,
          referenceType: 'PURCHASE_ORDER',
          referenceId: 'PRD-2026-0001',
          reason: 'توريد دفعة قياسية للمستودع الرئيسي',
          actorName: 'Mohamed Bahaa',
          createdAt: '2026-11-23T19:00:00.000Z',
        },
      ],
    };
    return detail as T;
  }

  if (cleanPath === '/inventory/adjust' && method === 'POST') {
    const b = (options.body ?? {}) as { productId?: string; mode?: 'ADD' | 'DEDUCT'; quantity?: number };
    const p = DEMO_PRODUCTS.find((item) => item.id === b.productId) ?? DEMO_PRODUCTS[0]!;
    const delta = (b.mode === 'DEDUCT' ? -1 : 1) * Number(b.quantity ?? 10);
    p.totalOnHand = Math.max(p.totalReserved, p.totalOnHand + delta);
    p.totalAvailable = Math.max(0, p.totalOnHand - p.totalReserved);
    p.stockHealth = p.totalAvailable === 0 ? 'OUT_OF_STOCK' : p.totalAvailable <= 15 ? 'LOW_STOCK' : 'IN_STOCK';
    return { adjusted: true, balanceAfter: p.totalOnHand } as T;
  }

  if (cleanPath === '/inventory/transfer' && method === 'POST') {
    return { transferred: true } as T;
  }

  if (cleanPath === '/inventory') {
    const levels: InventoryLevelDto[] = DEMO_PRODUCTS.slice(0, 20).map((p, i) => {
      const wh = DEMO_WAREHOUSES[i % DEMO_WAREHOUSES.length]!;
      return {
        id: `inv-${p.id}-${wh.id}`,
        productId: p.id,
        productSku: p.sku,
        productName: p.name,
        warehouseId: wh.id,
        warehouseCode: wh.code,
        warehouseName: wh.name,
        quantityOnHand: p.totalOnHand,
        quantityReserved: p.totalReserved,
        quantityAvailable: p.totalAvailable,
        reorderPoint: 15,
        stockHealth: p.stockHealth,
        version: 3,
        updatedAt: p.updatedAt,
      };
    });
    const response: OffsetPaginatedResponse<InventoryLevelDto> = {
      data: levels,
      meta: {
        total: 2500,
        page: 1,
        limit: 20,
        totalPages: 125,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    };
    return response as T;
  }

  if (cleanPath === '/inventory/movements') {
    const movements: StockMovementDto[] = [
      {
        id: 'mov-demo-1',
        productId: 'prd-demo-0001',
        productSku: 'PRD-2026-0001',
        productName: 'حساس صناعي لاسلكي',
        warehouseId: 'w-cai-01',
        warehouseCode: 'WH-CAI-01',
        warehouseName: 'مستودع القاهرة (WH-CAI-01)',
        type: 'IN',
        quantityDelta: 1200,
        balanceAfter: 2400,
        referenceType: 'ORDER',
        referenceId: 'PRD-2026-0001',
        reason: 'توريد دفعة مخزنية جديدة',
        performedById: activeDemoUser.id,
        performedByName: 'Mohamed Bahaa',
        createdAt: '2026-11-23T20:15:00.000Z',
      },
      {
        id: 'mov-demo-2',
        productId: 'prd-demo-0002',
        productSku: 'PRD-2026-0082',
        productName: 'بوابة شبكة ذكية',
        warehouseId: 'w-ruh-03',
        warehouseCode: 'WH-RUH-03',
        warehouseName: 'مستودع الرياض (WH-RUH-03)',
        type: 'TRANSFER_OUT',
        quantityDelta: -350,
        balanceAfter: 850,
        referenceType: 'TRANSFER',
        referenceId: 'PRD-2026-0082',
        reason: 'تحويل بين المستودعات الإقليمية',
        performedById: activeDemoUser.id,
        performedByName: 'أحمد السيد',
        createdAt: '2026-11-23T19:40:00.000Z',
      },
      {
        id: 'mov-demo-3',
        productId: 'prd-demo-0005',
        productSku: 'PRD-2026-0045',
        productName: 'كابل توصيل ألياف',
        warehouseId: 'w-dxb-04',
        warehouseCode: 'WH-DXB-04',
        warehouseName: 'مستودع دبي (WH-DXB-04)',
        type: 'ADJUSTMENT',
        quantityDelta: -15,
        balanceAfter: 105,
        referenceType: 'ADJUSTMENT',
        referenceId: 'PRD-2026-0045',
        reason: 'تسوية جرد دوري',
        performedById: activeDemoUser.id,
        performedByName: 'سارة محمود',
        createdAt: '2026-11-23T18:20:00.000Z',
      },
    ];
    const response: CursorPaginatedResponse<StockMovementDto> = {
      data: movements,
      meta: { nextCursor: null, hasMore: false, limit: 50 },
    };
    return response as T;
  }

  if (cleanPath === '/orders/bulk-status' && method === 'POST') {
    const b = (options.body ?? {}) as { ids?: string[]; toStatus?: OrderStatus };
    const ids = b.ids ?? [];
    for (const o of DEMO_ORDERS) {
      if (ids.includes(o.id) && b.toStatus) {
        o.status = b.toStatus;
      }
    }
    return { succeededIds: ids, failed: [] } as T;
  }

  if (cleanPath === '/orders') {
    if (method === 'POST') {
      const b = (options.body ?? {}) as {
        warehouseId?: string;
        items?: Array<{ productId: string; quantity: number }>;
      };
      const wh = DEMO_WAREHOUSES.find((w) => w.id === b.warehouseId) ?? DEMO_WAREHOUSES[0]!;
      const createdId = `ord-demo-${String(DEMO_ORDERS.length + 1).padStart(4, '0')}`;
      const newOrder: OrderListItemDto = {
        id: createdId,
        orderNumber: `ORD-2026-${Math.floor(18850 + Math.random() * 900)}`,
        customerId: 'cust-demo-1',
        customerName: 'أحمد محمد',
        customerCompany: 'مجموعة الفطيم',
        warehouseId: wh.id,
        warehouseCode: wh.code,
        warehouseName: wh.name,
        status: 'PENDING',
        itemCount: b.items?.length ?? 1,
        subtotal: 250,
        discountAmount: 0,
        taxAmount: 35,
        totalAmount: 285,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      DEMO_ORDERS.unshift(newOrder);
      return {
        ...newOrder,
        customerEmail: 'a.marri@alfuttaim.com',
        customerPhone: '+971 50 123 4567',
        cancellationReason: null,
        restockedOnRefund: false,
        createdByName: activeDemoUser.fullName,
        items: DEMO_PRODUCTS.slice(0, 2).map((p, idx) => ({
          id: `oi-new-${idx + 1}`,
          productId: p.id,
          productSku: p.sku,
          productName: p.name,
          quantity: 1,
          unitPriceSnapshot: p.unitPrice,
          unitCostSnapshot: p.unitCost,
          lineTotal: p.unitPrice,
        })),
        statusHistory: [
          {
            id: `sh-new-1`,
            fromStatus: null,
            toStatus: 'PENDING',
            reason: 'إنشاء الطلب مع حجز المخزون ذرياً',
            changedByName: activeDemoUser.fullName,
            createdAt: new Date().toISOString(),
          },
        ],
      } as T;
    }
    const queryStr = path.split('?')[1] ?? '';
    const sp = new URLSearchParams(queryStr);
    const statusFilter = sp.get('status');
    const filtered = statusFilter
      ? DEMO_ORDERS.filter((o) => o.status === statusFilter)
      : DEMO_ORDERS;
    const response: OffsetPaginatedResponse<OrderListItemDto> = {
      data: filtered,
      meta: {
        total: 25003,
        page: 1,
        limit: 20,
        totalPages: 1251,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    };
    return response as T;
  }

  if (cleanPath.startsWith('/orders/')) {
    const isStatusTransition = cleanPath.endsWith('/status') && method === 'POST';
    const id = cleanPath.replace('/orders/', '').replace('/status', '');
    const ord = DEMO_ORDERS.find((o) => o.id === id) ?? DEMO_ORDERS[0]!;
    if (isStatusTransition) {
      const b = (options.body ?? {}) as { toStatus?: OrderStatus; reason?: string };
      if (b.toStatus) {
        ord.status = b.toStatus;
        ord.updatedAt = new Date().toISOString();
      }
    }
    const detail: OrderDetailDto = {
      ...ord,
      customerEmail: 'a.marri@alfuttaim.com',
      customerPhone: '+971 50 123 4567',
      cancellationReason: null,
      restockedOnRefund: false,
      createdByName: 'Mohamed Bahaa',
      items: DEMO_PRODUCTS.slice(0, 3).map((p, idx) => ({
        id: `oi-${idx + 1}`,
        productId: p.id,
        productSku: p.sku,
        productName: p.name,
        quantity: idx + 1,
        unitPriceSnapshot: p.unitPrice,
        unitCostSnapshot: p.unitCost,
        lineTotal: Number(((idx + 1) * p.unitPrice).toFixed(2)),
      })),
      statusHistory: [
        {
          id: 'sh-1',
          fromStatus: null,
          toStatus: 'PENDING',
          reason: 'إنشاء الطلب مع حجز المخزون ذرياً',
          changedByName: 'Mohamed Bahaa',
          createdAt: new Date(Date.now() - 72 * 3600_000).toISOString(),
        },
        {
          id: 'sh-2',
          fromStatus: 'PENDING',
          toStatus: ord.status,
          reason: 'تحديث الحالة واعتماد حركة المخزون',
          changedByName: 'Mohamed Bahaa',
          createdAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
        },
      ],
    };
    return detail as T;
  }

  if (cleanPath.startsWith('/customers/') && (method === 'PATCH' || method === 'DELETE')) {
    const b = (options.body ?? {}) as Partial<CustomerListItemDto>;
    return {
      id: cleanPath.replace('/customers/', ''),
      name: b.name ?? 'أحمد المري',
      companyName: b.companyName ?? 'مجموعة الفطيم',
      email: b.email ?? 'a.marri@alfuttaim.com',
      phone: b.phone ?? '+971 50 123 4567',
      orderCount: 42,
      totalSpent: 84200,
      createdAt: '2026-02-15T10:00:00.000Z',
    } as T;
  }

  if (cleanPath === '/customers') {
    if (method === 'POST') {
      const b = (options.body ?? {}) as Partial<CustomerListItemDto>;
      return {
        id: `cust-demo-${Date.now()}`,
        name: b.name ?? 'عميل جديد',
        companyName: b.companyName ?? 'شركة أعمال',
        email: b.email ?? 'client@company.com',
        phone: b.phone ?? '+966 50 123 4567',
        orderCount: 0,
        totalSpent: 0,
        createdAt: new Date().toISOString(),
      } as T;
    }
    const customerSeed: CustomerListItemDto[] = [
      { id: 'cust-demo-1', name: 'أحمد المري', companyName: 'مجموعة الفطيم', email: 'a.marri@alfuttaim.com', phone: '+971 50 123 4567', orderCount: 42, totalSpent: 84200, createdAt: '2026-02-15T10:00:00.000Z' },
      { id: 'cust-demo-2', name: 'سارة الجابري', companyName: 'اتصالات', email: 's.jabri@etisalat.ae', phone: '+971 50 987 6543', orderCount: 28, totalSpent: 56400, createdAt: '2026-02-18T10:00:00.000Z' },
      { id: 'cust-demo-3', name: 'فيصل القحطاني', companyName: 'شركة الخريف', email: 'f.qahtani@alkhorayef.com', phone: '+966 50 987 6543', orderCount: 19, totalSpent: 38150, createdAt: '2026-03-01T10:00:00.000Z' },
      { id: 'cust-demo-4', name: 'فاطمة البلوشي', companyName: 'مجموعة الفوزان', email: 'f.balushi@alfKT.com', phone: '+966 50 987 6543', orderCount: 12, totalSpent: 24900, createdAt: '2026-03-10T10:00:00.000Z' },
      { id: 'cust-demo-5', name: 'يوسف الأنصاري', companyName: 'صناعات الغانم', email: 'y.ansari@alghanim.com', phone: '+966 50 987 6543', orderCount: 8, totalSpent: 15300, createdAt: '2026-03-15T10:00:00.000Z' },
      { id: 'cust-demo-6', name: 'مريم المهيري', companyName: 'بنك دبي الإسلامي', email: 'm.muhairi@dib.ae', phone: '+971 50 987 6567', orderCount: 3, totalSpent: 6250, createdAt: '2026-03-22T10:00:00.000Z' },
    ];
    const response: OffsetPaginatedResponse<CustomerListItemDto> = {
      data: customerSeed,
      meta: {
        total: 200,
        page: 1,
        limit: 20,
        totalPages: 10,
        hasNextPage: true,
        hasPreviousPage: false,
      },
    };
    return response as T;
  }

  if (cleanPath.startsWith('/users/') && cleanPath.endsWith('/revoke-sessions') && method === 'POST') {
    return { revokedCount: 1 } as T;
  }

  if (cleanPath.startsWith('/users/') && method === 'PATCH') {
    const b = (options.body ?? {}) as Partial<UserListItemDto>;
    if (b.fullName && cleanPath.endsWith('u-1')) {
      activeDemoUser = { ...activeDemoUser, fullName: b.fullName };
    }
    return {
      id: cleanPath.replace('/users/', ''),
      fullName: b.fullName ?? activeDemoUser.fullName,
      email: 'mohamed@omniops.com',
      role: b.role ?? ROLES.ADMIN,
      status: b.status ?? 'ACTIVE',
      activeSessionsCount: 1,
      lastLoginAt: new Date().toISOString(),
      createdAt: '2026-01-01T09:00:00.000Z',
    } as T;
  }

  if (cleanPath === '/users') {
    if (method === 'POST') {
      const b = (options.body ?? {}) as Partial<UserListItemDto>;
      return {
        id: `u-new-${Date.now()}`,
        fullName: b.fullName ?? 'مستخدم جديد',
        email: b.email ?? 'user@omniops.com',
        role: b.role ?? ROLES.EDITOR,
        status: 'ACTIVE',
        activeSessionsCount: 0,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
      } as T;
    }
    const users: UserListItemDto[] = [
      { id: 'u-1', fullName: activeDemoUser.fullName, email: 'mohamed@omniops.com', role: ROLES.ADMIN, status: 'ACTIVE', activeSessionsCount: 2, lastLoginAt: '2026-11-23T21:00:00.000Z', createdAt: '2026-01-01T09:00:00.000Z' },
      { id: 'u-2', fullName: 'أحمد السيد', email: 'ahmed.elsayed@omniops.com', role: ROLES.EDITOR, status: 'ACTIVE', activeSessionsCount: 1, lastLoginAt: '2026-11-23T18:30:00.000Z', createdAt: '2026-01-05T09:00:00.000Z' },
      { id: 'u-3', fullName: 'سارة محمود', email: 'sara.mahmoud@omniops.com', role: ROLES.VIEWER, status: 'ACTIVE', activeSessionsCount: 1, lastLoginAt: '2026-11-22T14:15:00.000Z', createdAt: '2026-01-10T09:00:00.000Z' },
      { id: 'u-4', fullName: 'عمر خالد', email: 'omar.khaled@omniops.com', role: ROLES.EDITOR, status: 'ACTIVE', activeSessionsCount: 3, lastLoginAt: '2026-11-23T20:45:00.000Z', createdAt: '2026-01-15T09:00:00.000Z' },
      { id: 'u-5', fullName: 'منى إبراهيم', email: 'mona.ibrahim@omniops.com', role: ROLES.VIEWER, status: 'ACTIVE', activeSessionsCount: 1, lastLoginAt: '2026-11-20T09:12:00.000Z', createdAt: '2026-01-20T09:00:00.000Z' },
    ];
    const response: OffsetPaginatedResponse<UserListItemDto> = {
      data: users,
      meta: {
        total: 5,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
    return response as T;
  }

  if (cleanPath === '/users/rbac-matrix') {
    return {
      matrix: {
        [ROLES.ADMIN]: [...ROLE_PERMISSIONS[ROLES.ADMIN]],
        [ROLES.EDITOR]: [...ROLE_PERMISSIONS[ROLES.EDITOR]],
        [ROLES.VIEWER]: [...ROLE_PERMISSIONS[ROLES.VIEWER]],
      },
    } as T;
  }

  if (cleanPath === '/audit-logs/meta') {
    return {
      actions: [
        'ORDER_STATUS_TRANSITION',
        'INVENTORY_TRANSFER',
        'PRODUCT_PRICE_UPDATE',
        'USER_ROLE_CHANGE',
        'EXPORT_CREATED',
      ],
      entityTypes: ['ORDER', 'INVENTORY_LEVEL', 'PRODUCT', 'USER', 'EXPORT_JOB'],
      actors: [
        { id: 'u-1', fullName: 'محمد بهاء (ADMIN)', email: 'mohamed@omniops.com' },
        { id: 'u-2', fullName: 'أحمد علي', email: 'ahmed.elsayed@omniops.com' },
        { id: 'u-3', fullName: 'سارة محمود', email: 'sara.mahmoud@omniops.com' },
      ],
    } as T;
  }

  if (cleanPath === '/audit-logs') {
    const logs: AuditLogDto[] = [
      {
        id: 'aud-1',
        actorId: 'u-1',
        actorName: 'محمد بهاء (ADMIN)',
        actorEmail: 'mohamed@omniops.com',
        actorRole: ROLES.ADMIN,
        action: 'ORDER_STATUS_TRANSITION',
        entityType: 'ORDER',
        entityId: 'ORD-2026-18848',
        beforeState: { status: 'SHIPPED', updated_at: '2026-11-23 19:30:00' },
        afterState: { status: 'DELIVERED', updated_at: '2026-11-23 21:14:02' },
        ipAddress: '197.54.12.88',
        createdAt: '2026-11-23T21:14:02.000Z',
      },
      {
        id: 'aud-2',
        actorId: 'u-2',
        actorName: 'أحمد علي',
        actorEmail: 'ahmed.elsayed@omniops.com',
        actorRole: ROLES.EDITOR,
        action: 'INVENTORY_TRANSFER',
        entityType: 'INVENTORY_LEVEL',
        entityId: 'WH-CAI-01 → WH-RUH-03',
        beforeState: { warehouse: 'WH-CAI-01', quantityOnHand: 1500 },
        afterState: { warehouse: 'WH-RUH-03', transferredQty: 350, quantityOnHand: 1150 },
        ipAddress: '41.33.90.14',
        createdAt: '2026-11-23T21:05:43.000Z',
      },
      {
        id: 'aud-3',
        actorId: 'u-3',
        actorName: 'سارة محمود',
        actorEmail: 'sara.mahmoud@omniops.com',
        actorRole: ROLES.EDITOR,
        action: 'PRODUCT_PRICE_UPDATE',
        entityType: 'PRODUCT',
        entityId: 'PRD-2026-0014',
        beforeState: { sku: 'PRD-2026-0014', unitPrice: 175.0 },
        afterState: { sku: 'PRD-2026-0014', unitPrice: 190.0 },
        ipAddress: '197.54.12.88',
        createdAt: '2026-11-23T20:58:12.000Z',
      },
      {
        id: 'aud-4',
        actorId: 'u-1',
        actorName: 'نظام تلقائي',
        actorEmail: 'system@omniops.com',
        actorRole: ROLES.ADMIN,
        action: 'USER_ROLE_CHANGE',
        entityType: 'USER',
        entityId: 'USER-9942',
        beforeState: { role: 'VIEWER', permissionsCount: 7 },
        afterState: { role: 'EDITOR', permissionsCount: 12 },
        ipAddress: '127.0.0.1',
        createdAt: '2026-11-23T20:44:19.000Z',
      },
      {
        id: 'aud-5',
        actorId: 'u-1',
        actorName: 'محمد بهاء (ADMIN)',
        actorEmail: 'mohamed@omniops.com',
        actorRole: ROLES.ADMIN,
        action: 'EXPORT_CREATED',
        entityType: 'EXPORT_JOB',
        entityId: 'EXP-9042',
        beforeState: null,
        afterState: { file: 'orders_2026.xlsx', rows: 25003, status: 'COMPLETED' },
        ipAddress: '197.54.12.88',
        createdAt: '2026-11-23T20:30:00.000Z',
      },
    ];
    const response: CursorPaginatedResponse<AuditLogDto> = {
      data: logs,
      meta: { nextCursor: null, hasMore: false, limit: 30 },
    };
    return response as T;
  }

  if (cleanPath === '/analytics/overview') {
    const overview: AnalyticsOverviewDto = {
      meta: {
        range: '30d',
        granularity: 'week',
        warehouseId: null,
        fromDate: new Date(Date.now() - 30 * 86400_000).toISOString(),
        toDate: new Date().toISOString(),
        cached: true,
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        totalRevenue: {
          value: 5840000,
          previousValue: 5117800,
          deltaPct: 14.11,
          sparkline: [320, 380, 360, 440, 490, 520, 560, 584],
        },
        grossProfit: {
          value: 1730000,
          previousValue: 1493000,
          deltaPct: 15.87,
          marginPct: 29.65,
          sparkline: [110, 125, 118, 138, 149, 158, 165, 173],
        },
        totalOrders: {
          value: 25003,
          previousValue: 22938,
          deltaPct: 9.0,
          completionRatePct: 86.4,
          cancellationRatePct: 6.3,
          sparkline: [68, 74, 71, 82, 79, 88, 92, 96],
        },
        inventoryValuation: {
          value: 14290000,
          totalUnits: 208470,
          lowStockCount: 38,
          outOfStockCount: 11,
          sparkline: [195, 198, 200, 202, 204, 206, 207, 208],
        },
      },
      revenueTrend: [
        { bucket: '2026-09-01', label: 'W1', revenue: 210000, profit: 75000, prevRevenue: 190000, prevProfit: 65000, orders: 320 },
        { bucket: '2026-09-08', label: 'W2', revenue: 310000, profit: 110000, prevRevenue: 270000, prevProfit: 92000, orders: 410 },
        { bucket: '2026-09-15', label: 'W3', revenue: 510000, profit: 195000, prevRevenue: 430000, prevProfit: 150000, orders: 580 },
        { bucket: '2026-09-22', label: 'W4', revenue: 340000, profit: 130000, prevRevenue: 310000, prevProfit: 115000, orders: 390 },
        { bucket: '2026-09-29', label: 'W5', revenue: 390000, profit: 155000, prevRevenue: 350000, prevProfit: 128000, orders: 440 },
        { bucket: '2026-10-06', label: 'W6', revenue: 615000, profit: 265000, prevRevenue: 530000, prevProfit: 210000, orders: 690 },
        { bucket: '2026-10-13', label: 'W7', revenue: 485000, profit: 220000, prevRevenue: 440000, prevProfit: 185000, orders: 540 },
        { bucket: '2026-10-20', label: 'W8', revenue: 620000, profit: 295000, prevRevenue: 560000, prevProfit: 245000, orders: 710 },
        { bucket: '2026-10-27', label: 'W9', revenue: 660000, profit: 335000, prevRevenue: 590000, prevProfit: 270000, orders: 750 },
        { bucket: '2026-11-03', label: 'W10', revenue: 550000, profit: 280000, prevRevenue: 510000, prevProfit: 235000, orders: 630 },
        { bucket: '2026-11-10', label: 'W11', revenue: 690000, profit: 340000, prevRevenue: 610000, prevProfit: 280000, orders: 780 },
        { bucket: '2026-11-17', label: 'W12', revenue: 790000, profit: 395000, prevRevenue: 680000, prevProfit: 315000, orders: 890 },
      ],
      ordersByStatus: [
        { status: 'DELIVERED', count: 10451, totalAmount: 9850200 },
        { status: 'SHIPPED', count: 4825, totalAmount: 4320100 },
        { status: 'CONFIRMED', count: 4100, totalAmount: 3690500 },
        { status: 'PENDING', count: 3125, totalAmount: 2810400 },
        { status: 'CANCELLED', count: 1575, totalAmount: 1390000 },
        { status: 'REFUNDED', count: 927, totalAmount: 810200 },
      ],
      topProducts: Array.from({ length: 10 }, (_, i) => ({
        productId: `prd-demo-${String(i + 1).padStart(4, '0')}`,
        sku: `PRD-2026-${String(i + 1).padStart(4, '0')}`,
        name: DEMO_PRODUCTS[i]?.name ?? `PRD-2026-000${i + 1}`,
        revenue: 148000 - i * 12500,
        quantity: 950 - i * 75,
        profit: Math.round((148000 - i * 12500) * 0.31),
      })),
      warehouseComparison: [
        { warehouseId: 'w-cai-01', code: 'WH-CAI-01', name: 'مستودع القاهرة الرئيسي', salesValue: 940000, stockValue: 730000, totalUnits: 48250, ordersCount: 1580 },
        { warehouseId: 'w-alx-02', code: 'WH-ALX-02', name: 'مركز الإسكندرية اللوجستي', salesValue: 850000, stockValue: 630000, totalUnits: 34120, ordersCount: 1390 },
        { warehouseId: 'w-ruh-03', code: 'WH-RUH-03', name: 'مستودع الرياض الإقليمي', salesValue: 800000, stockValue: 610000, totalUnits: 51900, ordersCount: 1210 },
        { warehouseId: 'w-dxb-04', code: 'WH-DXB-04', name: 'مستودع جبل علي', salesValue: 705000, stockValue: 500000, totalUnits: 44800, ordersCount: 1050 },
        { warehouseId: 'w-jed-05', code: 'WH-JED-05', name: 'بوابة البحر الأحمر', salesValue: 555000, stockValue: 360000, totalUnits: 29400, ordersCount: 860 },
      ],
      stockMovementFlow: [
        { bucket: '2026-10-01', label: 'W1', stockIn: 5900, stockOut: 2200 },
        { bucket: '2026-10-08', label: 'W2', stockIn: 5800, stockOut: 7000 },
        { bucket: '2026-10-15', label: 'W3', stockIn: 5300, stockOut: 3200 },
        { bucket: '2026-10-22', label: 'W4', stockIn: 4900, stockOut: 1700 },
        { bucket: '2026-10-29', label: 'W5', stockIn: 6300, stockOut: 3400 },
        { bucket: '2026-11-05', label: 'W6', stockIn: 6700, stockOut: 4300 },
        { bucket: '2026-11-12', label: 'W7', stockIn: 7300, stockOut: 4300 },
        { bucket: '2026-11-19', label: 'W8', stockIn: 6500, stockOut: 4100 },
      ],
      lowStockAlerts: [
        { id: 'lsa-1', productId: 'prd-demo-0001', sku: 'PRD-2026-0001', productName: 'حساس صناعي لاسلكي', warehouseCode: 'WH-CAI-01', available: 0, reorderPoint: 15, status: 'OUT_OF_STOCK' },
        { id: 'lsa-2', productId: 'prd-demo-0004', sku: 'PRD-2026-0034', productName: 'محول طاقة مستمر', warehouseCode: 'WH-CAI-01', available: 3, reorderPoint: 15, status: 'LOW_STOCK' },
        { id: 'lsa-3', productId: 'prd-demo-0006', sku: 'PRD-2026-0058', productName: 'لوحة تحكم ذكية', warehouseCode: 'WH-CAI-01', available: 0, reorderPoint: 15, status: 'OUT_OF_STOCK' },
      ],
      recentOrders: [
        { id: 'ord-demo-0001', orderNumber: 'ORD-2026-18848', customerName: 'أحمد محمد', warehouseCode: 'WH-CAI-01', totalAmount: 145.0, status: 'CONFIRMED', createdAt: '2026-11-23T14:20:00.000Z' },
        { id: 'ord-demo-0002', orderNumber: 'ORD-2026-18857', customerName: 'سارة أحمد', warehouseCode: 'WH-RUH-03', totalAmount: 89.5, status: 'DELIVERED', createdAt: '2026-11-23T12:10:00.000Z' },
        { id: 'ord-demo-0003', orderNumber: 'ORD-2026-18849', customerName: 'خالد عبد الله', warehouseCode: 'WH-DXB-04', totalAmount: 430.0, status: 'DELIVERED', createdAt: '2026-11-22T18:40:00.000Z' },
      ],
    };
    return overview as T;
  }

  if (cleanPath.startsWith('/reports/jobs/') && cleanPath.endsWith('/retry') && method === 'POST') {
    return {
      id: 'orders_2026.xlsx',
      requestedById: activeDemoUser.id,
      requestedByName: activeDemoUser.fullName,
      reportType: 'orders',
      format: 'XLSX',
      status: 'COMPLETED',
      rowCount: 25003,
      errorMessage: null,
      expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      isExpired: false,
      canDownload: true,
      createdAt: new Date().toISOString(),
    } as T;
  }

  if (cleanPath === '/reports/jobs') {
    const jobs: OffsetPaginatedResponse<ExportJobDto> = {
      data: [
        {
          id: 'orders_2026.xlsx',
          requestedById: activeDemoUser.id,
          requestedByName: 'Mohamed Bahaa',
          reportType: 'orders',
          format: 'XLSX',
          status: 'COMPLETED',
          rowCount: 25003,
          errorMessage: null,
          expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
          isExpired: false,
          canDownload: true,
          createdAt: new Date(Date.now() - 600_000).toISOString(),
        },
        {
          id: 'inventory_report.csv',
          requestedById: activeDemoUser.id,
          requestedByName: 'Mohamed Bahaa',
          reportType: 'inventory',
          format: 'XLSX',
          status: 'COMPLETED',
          rowCount: 12450,
          errorMessage: null,
          expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
          isExpired: false,
          canDownload: true,
          createdAt: new Date(Date.now() - 1800_000).toISOString(),
        },
        {
          id: 'customers_list.xlsx',
          requestedById: activeDemoUser.id,
          requestedByName: 'أحمد السيد',
          reportType: 'products',
          format: 'XLSX',
          status: 'PROCESSING',
          rowCount: 3100,
          errorMessage: null,
          expiresAt: null,
          isExpired: false,
          canDownload: false,
          createdAt: new Date(Date.now() - 120_000).toISOString(),
        },
      ],
      meta: {
        total: 3,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
    return jobs as T;
  }

  return {} as T;
}
