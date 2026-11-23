import {
  ExportFormat,
  ExportJobStatus,
  NotificationType,
  OrderStatus,
  Prisma,
  PrismaClient,
  StockMovementType,
  StockReferenceType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? 'OmniOps@2026!';
const SEED_SCALE = process.env.SEED_SCALE === 'light' ? 'light' : 'standard';

const CONFIG =
  SEED_SCALE === 'light'
    ? {
        products: 60,
        customers: 30,
        orders: 400,
        extraMovements: 600,
      }
    : {
        products: 500,
        customers: 200,
        orders: 25_000,
        extraMovements: 25_000,
      };

/** Simple deterministic PRNG (Mulberry32) so seeded analytics are reproducible. */
function createRng(seed = 20261123) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)] as T;
}

function randInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

async function insertInChunks<T>(
  items: T[],
  chunkSize: number,
  fn: (chunk: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < items.length; i += chunkSize) {
    await fn(items.slice(i, i + chunkSize));
  }
}

async function main() {
  const startedAt = Date.now();
  const rng = createRng(20261123);

  // Idempotency guard: skip full seed if demo admin already exists
  const existingAdmin = await prisma.user.findFirst({
    where: { email: 'admin@omniops.dev', deletedAt: null },
  });
  if (existingAdmin) {
    console.log('Seed skipped: OmniOps demo dataset already exists.');
    return;
  }

  console.log(`Starting OmniOps seed (scale=${SEED_SCALE})...`);

  // 1. Demo Accounts + Team Members
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  const adminId = randomUUID();
  const editorId = randomUUID();
  const viewerId = randomUUID();
  const opsLeadId = randomUUID();

  await prisma.user.createMany({
    data: [
      {
        id: adminId,
        email: 'admin@omniops.dev',
        passwordHash,
        fullName: 'Mohamed Bahaa (Admin)',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        lastLoginAt: new Date(),
      },
      {
        id: editorId,
        email: 'editor@omniops.dev',
        passwordHash,
        fullName: 'Sara Mansour (Operations Editor)',
        role: UserRole.EDITOR,
        status: UserStatus.ACTIVE,
        lastLoginAt: new Date(Date.now() - 3_600_000),
      },
      {
        id: viewerId,
        email: 'viewer@omniops.dev',
        passwordHash,
        fullName: 'Khaled Nabil (Analytics Viewer)',
        role: UserRole.VIEWER,
        status: UserStatus.ACTIVE,
        lastLoginAt: new Date(Date.now() - 86_400_000),
      },
      {
        id: opsLeadId,
        email: 'ops.lead@omniops.dev',
        passwordHash,
        fullName: 'Omar Farouk (Warehouse Lead)',
        role: UserRole.EDITOR,
        status: UserStatus.ACTIVE,
      },
    ],
  });

  const actorIds = [adminId, editorId, opsLeadId];

  // 2. Warehouses (5 Regional Fulfillment Hubs)
  const warehouseDefs = [
    { code: 'WH-CAI-01', name: 'Cairo Central Hub', location: '6th of October, Cairo, EG' },
    { code: 'WH-ALX-02', name: 'Alexandria Port Depot', location: 'Borg El Arab, Alexandria, EG' },
    { code: 'WH-RYD-03', name: 'Riyadh Logistics Center', location: 'Al Sulay, Riyadh, SA' },
    { code: 'WH-DXB-04', name: 'Dubai JAFZA Hub', location: 'Jebel Ali Free Zone, Dubai, AE' },
    { code: 'WH-AMM-05', name: 'Amman Distribution Hub', location: 'Sahab Industrial City, Amman, JO' },
  ];

  const warehouses = warehouseDefs.map((w) => ({
    id: randomUUID(),
    ...w,
    isActive: true,
  }));

  await prisma.warehouse.createMany({ data: warehouses });

  // 3. Categories (4 Parent + 8 Child Categories)
  const parentCategories = [
    { id: randomUUID(), name: 'Computing & Workstations', slug: 'computing-workstations' },
    { id: randomUUID(), name: 'Networking & Infrastructure', slug: 'networking-infrastructure' },
    { id: randomUUID(), name: 'Industrial Peripherals', slug: 'industrial-peripherals' },
    { id: randomUUID(), name: 'Power & Storage Systems', slug: 'power-storage-systems' },
  ];

  const childCategories = [
    { id: randomUUID(), name: 'Enterprise Laptops', slug: 'enterprise-laptops', parentId: parentCategories[0]!.id },
    { id: randomUUID(), name: 'Workstation Monitors', slug: 'workstation-monitors', parentId: parentCategories[0]!.id },
    { id: randomUUID(), name: 'Managed Switches', slug: 'managed-switches', parentId: parentCategories[1]!.id },
    { id: randomUUID(), name: 'Wi-Fi 7 Access Points', slug: 'wifi-7-access-points', parentId: parentCategories[1]!.id },
    { id: randomUUID(), name: 'Barcode & RFID Scanners', slug: 'barcode-rfid-scanners', parentId: parentCategories[2]!.id },
    { id: randomUUID(), name: 'Thermal Label Printers', slug: 'thermal-label-printers', parentId: parentCategories[2]!.id },
    { id: randomUUID(), name: 'Rack UPS Units', slug: 'rack-ups-units', parentId: parentCategories[3]!.id },
    { id: randomUUID(), name: 'NVMe NAS Enclosures', slug: 'nvme-nas-enclosures', parentId: parentCategories[3]!.id },
  ];

  await prisma.category.createMany({
    data: parentCategories.map((c) => ({ ...c, isActive: true })),
  });
  await prisma.category.createMany({
    data: childCategories.map((c) => ({ ...c, isActive: true })),
  });

  // 4. Products (500 SKUs)
  const productPrefixes = ['ProBook', 'OptiRack', 'NetCore', 'ScanMax', 'PowerVault', 'FlexDock', 'UltraView', 'DataNode'];
  const productTiers = ['Lite', 'Pro', 'Enterprise', 'Ultra', 'Industrial', 'Series X', 'Gen 4', 'Max'];

  const products: Array<{
    id: string;
    sku: string;
    name: string;
    categoryId: string;
    unitCost: number;
    unitPrice: number;
    isActive: boolean;
  }> = [];

  for (let i = 1; i <= CONFIG.products; i++) {
    const cat = childCategories[i % childCategories.length]!;
    const cost = Number((randInt(45, 1450, rng) + rng()).toFixed(2));
    const margin = 1.22 + rng() * 0.38;
    const price = Number((cost * margin).toFixed(2));

    products.push({
      id: randomUUID(),
      sku: `SKU-${String(i).padStart(4, '0')}`,
      name: `${productPrefixes[i % productPrefixes.length]} ${productTiers[i % productTiers.length]} #${i}`,
      categoryId: cat.id,
      unitCost: cost,
      unitPrice: price,
      isActive: i % 25 !== 0,
    });
  }

  await insertInChunks(products, 500, (chunk) =>
    prisma.product.createMany({
      data: chunk.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        categoryId: p.categoryId,
        unitCost: new Prisma.Decimal(p.unitCost.toFixed(2)),
        unitPrice: new Prisma.Decimal(p.unitPrice.toFixed(2)),
        isActive: p.isActive,
      })),
    }),
  );

  // 5. Inventory Levels (Products x Warehouses) — respects CHECK constraints
  const inventoryLevels: Array<{
    id: string;
    productId: string;
    warehouseId: string;
    quantityOnHand: number;
    quantityReserved: number;
    reorderPoint: number;
    version: number;
  }> = [];

  const initialMovements: Prisma.StockMovementCreateManyInput[] = [];
  const oneYearAgo = Date.now() - 365 * 86_400_000;

  for (let pIdx = 0; pIdx < products.length; pIdx++) {
    const product = products[pIdx]!;
    for (let wIdx = 0; wIdx < warehouses.length; wIdx++) {
      const warehouse = warehouses[wIdx]!;
      const reorderPoint = randInt(10, 35, rng);

      // Intentionally create realistic distribution: healthy, low-stock, and out-of-stock rows
      let onHand: number;
      const bucket = (pIdx * 7 + wIdx) % 20;
      if (bucket === 0) {
        onHand = 0; // Out of stock
      } else if (bucket <= 2) {
        onHand = randInt(1, Math.max(1, reorderPoint - 1), rng); // Low stock
      } else {
        onHand = randInt(reorderPoint + 10, 320, rng); // Healthy stock
      }

      const reserved = onHand > 5 ? randInt(0, Math.min(12, Math.floor(onHand * 0.2)), rng) : 0;

      inventoryLevels.push({
        id: randomUUID(),
        productId: product.id,
        warehouseId: warehouse.id,
        quantityOnHand: onHand,
        quantityReserved: reserved,
        reorderPoint,
        version: 1,
      });

      initialMovements.push({
        id: randomUUID(),
        productId: product.id,
        warehouseId: warehouse.id,
        type: StockMovementType.IN,
        quantityDelta: onHand + 40,
        balanceAfter: onHand + 40,
        referenceType: StockReferenceType.MANUAL,
        referenceId: `INIT-${warehouse.code}`,
        reason: 'Initial opening inventory balance',
        performedBy: adminId,
        createdAt: new Date(oneYearAgo + randInt(0, 86_400_000, rng)),
      });
    }
  }

  await insertInChunks(inventoryLevels, 1000, (chunk) =>
    prisma.inventoryLevel.createMany({ data: chunk }),
  );

  // 6. Customers (200 B2B/B2C Accounts)
  const companies = [
    'Delta Supply Co.',
    'Nile Tech Trading',
    'Gulf Horizon Logistics',
    'Al-Futtaim Industrial',
    'Red Sea Distribution',
    'Oasis Retail Group',
    'Summit Enterprise Solutions',
    'Atlas Digital Systems',
  ];

  const customers = Array.from({ length: CONFIG.customers }, (_, idx) => ({
    id: randomUUID(),
    name: `Customer Account ${idx + 1}`,
    email: `procurement.${idx + 1}@client-${(idx % 40) + 1}.example.com`,
    phone: `+20-100-${String(1000000 + idx * 137).slice(0, 7)}`,
    companyName: companies[idx % companies.length]!,
  }));

  await prisma.customer.createMany({ data: customers });

  // 7. Orders (25,000), OrderItems, OrderStatusHistory & StockMovements
  const statusWeights: Array<{ status: OrderStatus; threshold: number }> = [
    { status: OrderStatus.DELIVERED, threshold: 0.62 },
    { status: OrderStatus.SHIPPED, threshold: 0.74 },
    { status: OrderStatus.CONFIRMED, threshold: 0.84 },
    { status: OrderStatus.PENDING, threshold: 0.91 },
    { status: OrderStatus.CANCELLED, threshold: 0.97 },
    { status: OrderStatus.REFUNDED, threshold: 1.0 },
  ];

  const cancellationReasons = [
    'Customer requested cancellation prior to dispatch',
    'Duplicate purchase order submitted by buyer',
    'Warehouse stock allocation conflict resolved via cancellation',
    'Payment authorization expired before confirmation',
  ];

  const refundReasons = [
    'Damaged packaging reported on delivery inspection',
    'Wrong SKU delivered; item returned and restocked',
    'Customer exercised 14-day B2B return policy',
  ];

  const ordersBatch: Prisma.OrderCreateManyInput[] = [];
  const orderItemsBatch: Prisma.OrderItemCreateManyInput[] = [];
  const statusHistoryBatch: Prisma.OrderStatusHistoryCreateManyInput[] = [];
  const movementBatch: Prisma.StockMovementCreateManyInput[] = [...initialMovements];

  const now = Date.now();
  const flushThresholds = 2000;

  async function flushOrderBatches() {
    if (ordersBatch.length > 0) {
      await prisma.order.createMany({ data: ordersBatch.splice(0, ordersBatch.length) });
    }
    if (orderItemsBatch.length > 0) {
      await insertInChunks(orderItemsBatch.splice(0, orderItemsBatch.length), 2500, (c) =>
        prisma.orderItem.createMany({ data: c }),
      );
    }
    if (statusHistoryBatch.length > 0) {
      await insertInChunks(statusHistoryBatch.splice(0, statusHistoryBatch.length), 2500, (c) =>
        prisma.orderStatusHistory.createMany({ data: c }),
      );
    }
    if (movementBatch.length >= 4000) {
      await insertInChunks(movementBatch.splice(0, movementBatch.length), 2500, (c) =>
        prisma.stockMovement.createMany({ data: c }),
      );
    }
  }

  for (let i = 1; i <= CONFIG.orders; i++) {
    const orderId = randomUUID();
    const orderNumber = `ORD-2026-${String(i).padStart(6, '0')}`;
    const customer = pick(customers, rng);
    const warehouse = pick(warehouses, rng);
    const creatorId = pick(actorIds, rng);

    const rStatus = rng();
    const status =
      statusWeights.find((w) => rStatus <= w.threshold)?.status ?? OrderStatus.DELIVERED;

    // Distribute dates across last 365 days with slight upward growth trend
    const daysAgo = Math.floor(Math.pow(rng(), 1.15) * 365);
    const createdAt = new Date(now - daysAgo * 86_400_000 - randInt(0, 86_400_000, rng));

    const itemCount = randInt(1, 3, rng);
    const chosenProductIds = new Set<string>();
    let subtotal = 0;

    for (let k = 0; k < itemCount; k++) {
      let product = pick(products, rng);
      while (chosenProductIds.has(product.id)) {
        product = pick(products, rng);
      }
      chosenProductIds.add(product.id);
      const qty = randInt(1, 6, rng);
      subtotal += product.unitPrice * qty;

      orderItemsBatch.push({
        id: randomUUID(),
        orderId,
        productId: product.id,
        quantity: qty,
        unitPriceSnapshot: new Prisma.Decimal(product.unitPrice.toFixed(2)),
        unitCostSnapshot: new Prisma.Decimal(product.unitCost.toFixed(2)),
      });

      // Record OUT movement for shipped/delivered/refunded orders
      if (
        status === OrderStatus.SHIPPED ||
        status === OrderStatus.DELIVERED ||
        status === OrderStatus.REFUNDED
      ) {
        const balanceSim = randInt(15, 240, rng);
        movementBatch.push({
          id: randomUUID(),
          productId: product.id,
          warehouseId: warehouse.id,
          type: StockMovementType.OUT,
          quantityDelta: -qty,
          balanceAfter: balanceSim,
          referenceType: StockReferenceType.ORDER,
          referenceId: orderNumber,
          reason: `Dispatched for order ${orderNumber}`,
          performedBy: creatorId,
          createdAt: new Date(createdAt.getTime() + 7_200_000),
        });

        if (status === OrderStatus.REFUNDED) {
          movementBatch.push({
            id: randomUUID(),
            productId: product.id,
            warehouseId: warehouse.id,
            type: StockMovementType.IN,
            quantityDelta: qty,
            balanceAfter: balanceSim + qty,
            referenceType: StockReferenceType.REFUND,
            referenceId: orderNumber,
            reason: `Restocked from refunded order ${orderNumber}`,
            performedBy: adminId,
            createdAt: new Date(createdAt.getTime() + 172_800_000),
          });
        }
      }
    }

    const discount = rng() < 0.25 ? Number((subtotal * 0.05).toFixed(2)) : 0;
    const tax = Number(((subtotal - discount) * 0.14).toFixed(2));
    const total = Number((subtotal - discount + tax).toFixed(2));

    const cancellationReason =
      status === OrderStatus.CANCELLED
        ? pick(cancellationReasons, rng)
        : status === OrderStatus.REFUNDED
          ? pick(refundReasons, rng)
          : null;

    ordersBatch.push({
      id: orderId,
      orderNumber,
      customerId: customer.id,
      warehouseId: warehouse.id,
      status,
      subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
      taxAmount: new Prisma.Decimal(tax.toFixed(2)),
      discountAmount: new Prisma.Decimal(discount.toFixed(2)),
      totalAmount: new Prisma.Decimal(total.toFixed(2)),
      cancellationReason,
      restockedOnRefund: status === OrderStatus.REFUNDED,
      createdBy: creatorId,
      createdAt,
      updatedAt: new Date(createdAt.getTime() + 10_800_000),
    });

    // Build realistic timeline entries in order_status_history
    statusHistoryBatch.push({
      id: randomUUID(),
      orderId,
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      reason: 'Order created',
      changedBy: creatorId,
      createdAt,
    });

    if (status !== OrderStatus.PENDING && status !== OrderStatus.CANCELLED) {
      statusHistoryBatch.push({
        id: randomUUID(),
        orderId,
        fromStatus: OrderStatus.PENDING,
        toStatus: OrderStatus.CONFIRMED,
        reason: 'Inventory reservation verified',
        changedBy: creatorId,
        createdAt: new Date(createdAt.getTime() + 3_600_000),
      });
    }

    if (
      status === OrderStatus.SHIPPED ||
      status === OrderStatus.DELIVERED ||
      status === OrderStatus.REFUNDED
    ) {
      statusHistoryBatch.push({
        id: randomUUID(),
        orderId,
        fromStatus: OrderStatus.CONFIRMED,
        toStatus: OrderStatus.SHIPPED,
        reason: 'Dispatched from warehouse',
        changedBy: opsLeadId,
        createdAt: new Date(createdAt.getTime() + 7_200_000),
      });
    }

    if (status === OrderStatus.DELIVERED || status === OrderStatus.REFUNDED) {
      statusHistoryBatch.push({
        id: randomUUID(),
        orderId,
        fromStatus: OrderStatus.SHIPPED,
        toStatus: OrderStatus.DELIVERED,
        reason: 'Carrier confirmed delivery',
        changedBy: opsLeadId,
        createdAt: new Date(createdAt.getTime() + 86_400_000),
      });
    }

    if (status === OrderStatus.CANCELLED) {
      statusHistoryBatch.push({
        id: randomUUID(),
        orderId,
        fromStatus: OrderStatus.PENDING,
        toStatus: OrderStatus.CANCELLED,
        reason: cancellationReason,
        changedBy: adminId,
        createdAt: new Date(createdAt.getTime() + 5_400_000),
      });
    }

    if (status === OrderStatus.REFUNDED) {
      statusHistoryBatch.push({
        id: randomUUID(),
        orderId,
        fromStatus: OrderStatus.DELIVERED,
        toStatus: OrderStatus.REFUNDED,
        reason: cancellationReason,
        changedBy: adminId,
        createdAt: new Date(createdAt.getTime() + 172_800_000),
      });
    }

    if (ordersBatch.length >= flushThresholds) {
      await flushOrderBatches();
    }
  }

  // 8. Additional Stock Adjustments & Warehouse Transfers to hit 50k+ ledger rows
  const extraTypes = [
    StockMovementType.IN,
    StockMovementType.ADJUSTMENT,
    StockMovementType.TRANSFER_IN,
    StockMovementType.TRANSFER_OUT,
  ];
  for (let m = 0; m < CONFIG.extraMovements; m++) {
    const product = pick(products, rng);
    const warehouse = pick(warehouses, rng);
    const type = pick(extraTypes, rng);
    const delta =
      type === StockMovementType.TRANSFER_OUT
        ? -randInt(2, 15, rng)
        : type === StockMovementType.ADJUSTMENT
          ? randInt(-5, 10, rng) || 3
          : randInt(10, 60, rng);

    movementBatch.push({
      id: randomUUID(),
      productId: product.id,
      warehouseId: warehouse.id,
      type,
      quantityDelta: delta,
      balanceAfter: randInt(20, 260, rng),
      referenceType:
        type === StockMovementType.TRANSFER_IN || type === StockMovementType.TRANSFER_OUT
          ? StockReferenceType.TRANSFER
          : StockReferenceType.MANUAL,
      referenceId: `REF-${String(m + 1).padStart(6, '0')}`,
      reason:
        type === StockMovementType.ADJUSTMENT
          ? 'Quarterly cycle count reconciliation'
          : 'Regional replenishment movement',
      performedBy: pick(actorIds, rng),
      createdAt: new Date(now - randInt(1, 360, rng) * 86_400_000),
    });

    if (movementBatch.length >= 4000) {
      await insertInChunks(movementBatch.splice(0, movementBatch.length), 2500, (c) =>
        prisma.stockMovement.createMany({ data: c }),
      );
    }
  }

  await flushOrderBatches();
  if (movementBatch.length > 0) {
    await insertInChunks(movementBatch.splice(0, movementBatch.length), 2500, (c) =>
      prisma.stockMovement.createMany({ data: c }),
    );
  }

  // 9. Sample Audit Logs, Notifications & Export Jobs
  await prisma.auditLog.createMany({
    data: [
      {
        id: randomUUID(),
        actorId: adminId,
        action: 'PRODUCT_UPDATED',
        entityType: 'Product',
        entityId: products[0]!.id,
        beforeState: { unitPrice: products[0]!.unitPrice - 15, isActive: true },
        afterState: { unitPrice: products[0]!.unitPrice, isActive: true },
        ipAddress: '10.0.14.22',
      },
      {
        id: randomUUID(),
        actorId: editorId,
        action: 'INVENTORY_ADJUSTED',
        entityType: 'InventoryLevel',
        entityId: inventoryLevels[0]!.id,
        beforeState: { quantityOnHand: 42 },
        afterState: { quantityOnHand: 48, reason: 'Cycle count surplus' },
        ipAddress: '10.0.14.89',
      },
      {
        id: randomUUID(),
        actorId: adminId,
        action: 'USER_ROLE_CHANGED',
        entityType: 'User',
        entityId: editorId,
        beforeState: { role: 'VIEWER' },
        afterState: { role: 'EDITOR' },
        ipAddress: '10.0.14.22',
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        id: randomUUID(),
        userId: adminId,
        type: NotificationType.LOW_STOCK,
        title: 'Low Stock Threshold Alert',
        message: `${products[1]!.sku} in ${warehouses[0]!.code} dropped below reorder point.`,
        metadata: { productId: products[1]!.id, warehouseId: warehouses[0]!.id },
      },
      {
        id: randomUUID(),
        userId: adminId,
        type: NotificationType.OUT_OF_STOCK,
        title: 'Out of Stock Alert',
        message: `${products[0]!.sku} in ${warehouses[0]!.code} reached 0 available units.`,
        metadata: { productId: products[0]!.id, warehouseId: warehouses[0]!.id },
      },
      {
        id: randomUUID(),
        userId: adminId,
        type: NotificationType.EXPORT_READY,
        title: 'Orders Report Export Ready',
        message: 'Your Q4 Orders XLSX report finished processing and is ready to download.',
        metadata: { format: 'XLSX', reportType: 'orders' },
      },
    ],
  });

  await prisma.exportJob.createMany({
    data: [
      {
        id: randomUUID(),
        requestedBy: adminId,
        reportType: 'orders',
        format: ExportFormat.XLSX,
        filters: { status: ['DELIVERED', 'SHIPPED'] },
        status: ExportJobStatus.COMPLETED,
        objectKey: 'exports/demo/orders-2026-q4.xlsx',
        rowCount: 14250,
        expiresAt: new Date(Date.now() + 24 * 3_600_000),
      },
      {
        id: randomUUID(),
        requestedBy: editorId,
        reportType: 'inventory_valuation',
        format: ExportFormat.PDF,
        filters: { warehouseCode: 'WH-CAI-01' },
        status: ExportJobStatus.COMPLETED,
        objectKey: 'exports/demo/inventory-wh-cai-01.pdf',
        rowCount: 500,
        expiresAt: new Date(Date.now() + 24 * 3_600_000),
      },
    ],
  });

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `OmniOps seed completed in ${elapsedSec}s! Demo login password for all 3 roles: ${DEMO_PASSWORD}`,
  );
  console.log('Demo accounts: admin@omniops.dev | editor@omniops.dev | viewer@omniops.dev');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
