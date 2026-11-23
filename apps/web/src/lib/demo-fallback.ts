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
  { id: 'w-cai-01', code: 'WH-CAI-01', name: 'Cairo Central Fulfillment Hub', location: 'Cairo, Egypt', isActive: true, skuCount: 500, totalUnits: 48250, createdAt: '2026-01-10T08:00:00.000Z' },
  { id: 'w-alx-02', code: 'WH-ALX-02', name: 'Alexandria Port Logistics Center', location: 'Alexandria, Egypt', isActive: true, skuCount: 500, totalUnits: 34120, createdAt: '2026-01-12T08:00:00.000Z' },
  { id: 'w-ruh-03', code: 'WH-RUH-03', name: 'Riyadh Regional Distribution Hub', location: 'Riyadh, KSA', isActive: true, skuCount: 500, totalUnits: 51900, createdAt: '2026-01-15T08:00:00.000Z' },
  { id: 'w-dxb-04', code: 'WH-DXB-04', name: 'Dubai Jebel Ali Freezone Hub', location: 'Dubai, UAE', isActive: true, skuCount: 500, totalUnits: 44800, createdAt: '2026-01-18T08:00:00.000Z' },
  { id: 'w-jed-05', code: 'WH-JED-05', name: 'Jeddah Red Sea Gateway', location: 'Jeddah, KSA', isActive: true, skuCount: 500, totalUnits: 29400, createdAt: '2026-01-20T08:00:00.000Z' },
];

const DEMO_CATEGORIES: CategoryDto[] = [
  { id: 'cat-01', name: 'Industrial Sensors', slug: 'industrial-sensors', parentId: null, isActive: true, productCount: 84 },
  { id: 'cat-02', name: 'Networking & Gateways', slug: 'networking-gateways', parentId: null, isActive: true, productCount: 76 },
  { id: 'cat-03', name: 'Power & UPS Systems', slug: 'power-ups-systems', parentId: null, isActive: true, productCount: 68 },
  { id: 'cat-04', name: 'Warehouse Robotics', slug: 'warehouse-robotics', parentId: null, isActive: true, productCount: 54 },
  { id: 'cat-05', name: 'Barcode & RFID Scanners', slug: 'barcode-rfid-scanners', parentId: null, isActive: true, productCount: 92 },
];

const DEMO_PRODUCTS: ProductListItemDto[] = Array.from({ length: 24 }, (_, idx) => {
  const num = idx + 1;
  const cat = DEMO_CATEGORIES[idx % DEMO_CATEGORIES.length]!;
  const unitCost = 45 + (idx % 9) * 18;
  const unitPrice = Number((unitCost * 1.42).toFixed(2));
  const totalOnHand = idx % 7 === 0 ? 0 : idx % 4 === 0 ? 12 : 140 + idx * 9;
  const totalReserved = totalOnHand > 20 ? 14 : 0;
  const totalAvailable = Math.max(0, totalOnHand - totalReserved);
  const stockHealth =
    totalAvailable === 0 ? 'OUT_OF_STOCK' : totalAvailable <= 15 ? 'LOW_STOCK' : 'IN_STOCK';
  return {
    id: `prd-demo-${String(num).padStart(4, '0')}`,
    sku: `PRD-2026-${String(num).padStart(4, '0')}`,
    name: `${cat.name.slice(0, -1)} Pro Series X${num}`,
    categoryId: cat.id,
    categoryName: cat.name,
    unitCost,
    unitPrice,
    isActive: idx !== 11,
    totalOnHand,
    totalReserved,
    totalAvailable,
    stockHealth,
    updatedAt: '2026-11-23T15:30:00.000Z',
  };
});

const DEMO_ORDERS: OrderListItemDto[] = Array.from({ length: 20 }, (_, idx) => {
  const statuses: OrderStatus[] = [
    'DELIVERED',
    'SHIPPED',
    'CONFIRMED',
    'PENDING',
    'CANCELLED',
    'REFUNDED',
  ];
  const status = statuses[idx % statuses.length]!;
  const wh = DEMO_WAREHOUSES[idx % DEMO_WAREHOUSES.length]!;
  const subtotal = 640 + idx * 185;
  const taxAmount = Number((subtotal * 0.14).toFixed(2));
  const totalAmount = Number((subtotal + taxAmount).toFixed(2));
  const company = [
    'Nile Industrial Group',
    'Red Sea Logistics',
    'Delta Automation Co.',
    'Gulf Smart Warehousing',
    'Cairo Tech Ventures',
    'Alexandria Marine Supply',
  ][idx % 6]!;
  return {
    id: `ord-demo-${String(idx + 1).padStart(4, '0')}`,
    orderNumber: `ORD-2026-${(100420 + idx).toString(16).toUpperCase()}`,
    customerId: `cust-demo-${(idx % 6) + 1}`,
    customerName: company,
    customerCompany: company,
    warehouseId: wh.id,
    warehouseCode: wh.code,
    warehouseName: wh.name,
    status,
    itemCount: (idx % 4) + 1,
    subtotal,
    discountAmount: 0,
    taxAmount,
    totalAmount,
    createdAt: new Date(Date.now() - idx * 36 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - idx * 18 * 3600 * 1000).toISOString(),
  };
});

function buildDemoUser(email?: string): AuthUser {
  const lower = (email ?? 'admin@omniops.dev').toLowerCase();
  const role: UserRole = lower.includes('viewer')
    ? ROLES.VIEWER
    : lower.includes('editor')
      ? ROLES.EDITOR
      : ROLES.ADMIN;
  const fullName =
    role === ROLES.ADMIN
      ? 'Mohamed Bahaa (Admin)'
      : role === ROLES.EDITOR
        ? 'Sara Mansour (Operations Editor)'
        : 'Karim Adel (Read-Only Auditor)';

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

  if (cleanPath === '/auth/context') {
    return {
      warehouses: DEMO_WAREHOUSES,
      notifications: [
        {
          id: 'notif-1',
          type: 'LOW_STOCK',
          title: 'Low Stock Alert — WH-CAI-01',
          message:
            'PRD-2026-0005 dropped below reorder threshold (12 available / 15 reorder point).',
          readAt: null,
          createdAt: new Date(Date.now() - 1800_000).toISOString(),
        },
        {
          id: 'notif-2',
          type: 'EXPORT_READY',
          title: 'ORDERS Export Ready (XLSX)',
          message: 'Processed 25,003 rows. Download available for 24h.',
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
        ipAddress: '172.64.0.1',
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
    return DEMO_WAREHOUSES as T;
  }

  if (cleanPath === '/products') {
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
    const found = DEMO_PRODUCTS.find((p) => p.id === id) ?? DEMO_PRODUCTS[0]!;
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
          quantityDelta: 50,
          balanceAfter: 140,
          referenceType: 'PURCHASE_ORDER',
          referenceId: 'PO-2026-8841',
          reason: 'Initial quarterly replenishment',
          actorName: 'Mohamed Bahaa (Admin)',
          createdAt: new Date(Date.now() - 86400_000).toISOString(),
        },
      ],
    };
    return detail as T;
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
    const movements: StockMovementDto[] = DEMO_PRODUCTS.slice(0, 15).map((p, i) => {
      const wh = DEMO_WAREHOUSES[i % DEMO_WAREHOUSES.length]!;
      const types = ['IN', 'OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT'] as const;
      const type = types[i % types.length]!;
      const delta = type === 'OUT' || type === 'TRANSFER_OUT' ? -(4 + i) : 12 + i;
      return {
        id: `mov-demo-${i + 1}`,
        productId: p.id,
        productSku: p.sku,
        productName: p.name,
        warehouseId: wh.id,
        warehouseCode: wh.code,
        warehouseName: wh.name,
        type,
        quantityDelta: delta,
        balanceAfter: 120 + delta,
        referenceType: 'ORDER',
        referenceId: `ORD-2026-${(100420 + i).toString(16).toUpperCase()}`,
        reason: 'Automated fulfillment ledger entry',
        performedById: activeDemoUser.id,
        performedByName: activeDemoUser.fullName,
        createdAt: new Date(Date.now() - i * 3600_000).toISOString(),
      };
    });
    const response: CursorPaginatedResponse<StockMovementDto> = {
      data: movements,
      meta: { nextCursor: null, hasMore: false, limit: 50 },
    };
    return response as T;
  }

  if (cleanPath === '/orders') {
    const response: OffsetPaginatedResponse<OrderListItemDto> = {
      data: DEMO_ORDERS,
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
    const id = cleanPath.replace('/orders/', '').replace('/status', '');
    const ord = DEMO_ORDERS.find((o) => o.id === id) ?? DEMO_ORDERS[0]!;
    const detail: OrderDetailDto = {
      ...ord,
      customerEmail: 'procurement@enterprise-client.com',
      customerPhone: '+20 100 555 0199',
      cancellationReason: null,
      restockedOnRefund: false,
      createdByName: 'Mohamed Bahaa (Admin)',
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
          reason: 'Order created with atomic stock reservation',
          changedByName: 'Mohamed Bahaa (Admin)',
          createdAt: new Date(Date.now() - 72 * 3600_000).toISOString(),
        },
        {
          id: 'sh-2',
          fromStatus: 'PENDING',
          toStatus: ord.status,
          reason: 'State transition verified',
          changedByName: 'Mohamed Bahaa (Admin)',
          createdAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
        },
      ],
    };
    return detail as T;
  }

  if (cleanPath === '/customers') {
    const customers: CustomerListItemDto[] = Array.from({ length: 12 }, (_, i) => ({
      id: `cust-demo-${i + 1}`,
      name:
        [
          'Ahmed El-Sayed',
          'Mona Ibrahim',
          'Tarek Mansour',
          'Nourhan Adel',
          'Youssef Kamal',
          'Heba Mostafa',
        ][i % 6]! + ` #${i + 1}`,
      email: `client${i + 1}@enterprise-mena.com`,
      phone: `+20 100 440 01${String(i + 10)}`,
      companyName: [
        'Nile Industrial Group',
        'Red Sea Logistics',
        'Delta Automation Co.',
        'Gulf Smart Warehousing',
      ][i % 4]!,
      orderCount: 14 + i * 3,
      totalSpent: 28450 + i * 4200,
      createdAt: '2026-02-15T10:00:00.000Z',
    }));
    const response: OffsetPaginatedResponse<CustomerListItemDto> = {
      data: customers,
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

  if (cleanPath === '/users') {
    const users: UserListItemDto[] = [
      buildDemoUser('ahmedalzaeem2416@gmail.com'),
      buildDemoUser('admin@omniops.dev'),
      buildDemoUser('editor@omniops.dev'),
      buildDemoUser('viewer@omniops.dev'),
      buildDemoUser('legendahmed300@gmail.com'),
    ].map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      status: u.status,
      lastLoginAt: u.lastLoginAt,
      activeSessionsCount: 1,
      createdAt: '2026-01-01T09:00:00.000Z',
    }));
    const response: OffsetPaginatedResponse<UserListItemDto> = {
      data: users,
      meta: {
        total: 4,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
    return response as T;
  }

  if (cleanPath === '/audit-logs') {
    const logs: AuditLogDto[] = [
      {
        id: 'aud-1',
        actorId: activeDemoUser.id,
        actorName: activeDemoUser.fullName,
        actorEmail: activeDemoUser.email,
        actorRole: activeDemoUser.role,
        action: 'ORDER_STATUS_TRANSITION',
        entityType: 'ORDER',
        entityId: 'ORD-2026-18844',
        beforeState: { status: 'CONFIRMED', quantityOnHand: 150, quantityReserved: 10 },
        afterState: { status: 'SHIPPED', quantityOnHand: 140, quantityReserved: 0 },
        ipAddress: '172.64.0.1',
        createdAt: new Date(Date.now() - 1200_000).toISOString(),
      },
      {
        id: 'aud-2',
        actorId: activeDemoUser.id,
        actorName: activeDemoUser.fullName,
        actorEmail: activeDemoUser.email,
        actorRole: activeDemoUser.role,
        action: 'INVENTORY_TRANSFER',
        entityType: 'INVENTORY_LEVEL',
        entityId: 'PRD-2026-0001',
        beforeState: { fromWarehouse: 'WH-CAI-01', onHandBefore: 180 },
        afterState: { toWarehouse: 'WH-ALX-02', transferredQty: 25, onHandAfter: 155 },
        ipAddress: '172.64.0.1',
        createdAt: new Date(Date.now() - 5400_000).toISOString(),
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
        range: '90d',
        granularity: 'week',
        warehouseId: null,
        fromDate: new Date(Date.now() - 90 * 86400_000).toISOString(),
        toDate: new Date().toISOString(),
        cached: true,
        generatedAt: new Date().toISOString(),
      },
      kpis: {
        totalRevenue: {
          value: 5842910.5,
          previousValue: 5120400,
          deltaPct: 14.11,
          sparkline: [410, 445, 430, 480, 515, 540, 595, 620],
        },
        grossProfit: {
          value: 1732450.25,
          previousValue: 1495200,
          deltaPct: 15.87,
          marginPct: 29.65,
          sparkline: [118, 129, 125, 141, 152, 160, 175, 184],
        },
        totalOrders: {
          value: 25003,
          previousValue: 22940,
          deltaPct: 9.0,
          completionRatePct: 86.4,
          cancellationRatePct: 6.3,
          sparkline: [72, 78, 75, 84, 88, 91, 95, 102],
        },
        inventoryValuation: {
          value: 14290500,
          totalUnits: 208470,
          lowStockCount: 38,
          outOfStockCount: 11,
          sparkline: [195, 198, 200, 202, 204, 206, 207, 208],
        },
      },
      revenueTrend: Array.from({ length: 12 }, (_, i) => {
        const rev = 380000 + i * 29500 + (i % 3) * 18000;
        const prevRev = 335000 + i * 24000;
        return {
          bucket: new Date(Date.now() - (11 - i) * 7 * 86400_000).toISOString().slice(0, 10),
          label: `W${i + 1}`,
          revenue: rev,
          profit: Math.round(rev * 0.296),
          prevRevenue: prevRev,
          prevProfit: Math.round(prevRev * 0.29),
          orders: 410 + i * 22,
        };
      }),
      ordersByStatus: [
        { status: 'DELIVERED', count: 10450, totalAmount: 9850200 },
        { status: 'SHIPPED', count: 4820, totalAmount: 4320100 },
        { status: 'CONFIRMED', count: 4110, totalAmount: 3690500 },
        { status: 'PENDING', count: 3123, totalAmount: 2810400 },
        { status: 'CANCELLED', count: 1580, totalAmount: 1390000 },
        { status: 'REFUNDED', count: 920, totalAmount: 810200 },
      ],
      topProducts: DEMO_PRODUCTS.slice(0, 10).map((p, i) => ({
        productId: p.id,
        sku: p.sku,
        name: p.name,
        revenue: 142000 - i * 11200,
        quantity: 890 - i * 65,
        profit: Math.round((142000 - i * 11200) * 0.31),
      })),
      warehouseComparison: DEMO_WAREHOUSES.map((w, i) => ({
        warehouseId: w.id,
        code: w.code,
        name: w.name,
        salesValue: 1450000 - i * 195000,
        stockValue: (w.totalUnits ?? 40000) * 68,
        totalUnits: w.totalUnits ?? 40000,
        ordersCount: 1580 - i * 190,
      })),
      stockMovementFlow: Array.from({ length: 10 }, (_, i) => ({
        bucket: new Date(Date.now() - (9 - i) * 7 * 86400_000).toISOString().slice(0, 10),
        label: `W${i + 1}`,
        stockIn: 6800 + i * 340,
        stockOut: 3400 + i * 210,
      })),
      lowStockAlerts: DEMO_PRODUCTS.filter((p) => p.stockHealth !== 'IN_STOCK')
        .slice(0, 5)
        .map((p, i) => ({
          id: `lsa-${i + 1}`,
          productId: p.id,
          sku: p.sku,
          productName: p.name,
          warehouseCode: DEMO_WAREHOUSES[i % DEMO_WAREHOUSES.length]!.code,
          available: p.totalAvailable,
          reorderPoint: 15,
          status: p.stockHealth === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : 'LOW_STOCK',
        })),
      recentOrders: DEMO_ORDERS.slice(0, 5).map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        warehouseCode: o.warehouseCode,
        totalAmount: o.totalAmount,
        status: o.status,
        createdAt: o.createdAt,
      })),
    };
    return overview as T;
  }

  if (cleanPath === '/reports/jobs') {
    const jobs: OffsetPaginatedResponse<ExportJobDto> = {
      data: [
        {
          id: '5e20f73c-e672-41d0-9f9a-5fcecad52386',
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
          createdAt: new Date(Date.now() - 600_000).toISOString(),
        },
      ],
      meta: {
        total: 1,
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
