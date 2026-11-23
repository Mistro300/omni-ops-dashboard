import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharedPkg from '../dist/index.js';

const {
  ALLOWED_ORDER_TRANSITIONS,
  bulkOrderStatusSchema,
  canTransitionOrderStatus,
  createExportSchema,
  createOrderSchema,
  createProductSchema,
  hasAllPermissions,
  hasPermission,
  ORDER_STATUSES,
  PERMISSIONS,
  requiresTransitionReason,
  ROLE_PERMISSIONS,
  ROLES,
  transferStockSchema,
} = sharedPkg;

describe('@omni-ops/shared — RBAC Permission Matrix', () => {
  it('grants ADMIN all 19 system permissions including sensitive actions', () => {
    const adminPerms = ROLE_PERMISSIONS[ROLES.ADMIN];
    assert.equal(adminPerms.length, 19);
    assert.equal(hasPermission(ROLES.ADMIN, PERMISSIONS.ORDERS_CANCEL), true);
    assert.equal(hasPermission(ROLES.ADMIN, PERMISSIONS.ORDERS_REFUND), true);
    assert.equal(hasPermission(ROLES.ADMIN, PERMISSIONS.USERS_MANAGE), true);
    assert.equal(hasPermission(ROLES.ADMIN, PERMISSIONS.PRODUCTS_DELETE), true);
  });

  it('grants EDITOR operational write permissions but denies Admin-only permissions', () => {
    assert.equal(hasPermission(ROLES.EDITOR, PERMISSIONS.PRODUCTS_WRITE), true);
    assert.equal(hasPermission(ROLES.EDITOR, PERMISSIONS.INVENTORY_ADJUST), true);
    assert.equal(hasPermission(ROLES.EDITOR, PERMISSIONS.INVENTORY_TRANSFER), true);
    assert.equal(hasPermission(ROLES.EDITOR, PERMISSIONS.ORDERS_WRITE), true);

    // Strictly denied for EDITOR
    assert.equal(hasPermission(ROLES.EDITOR, PERMISSIONS.PRODUCTS_DELETE), false);
    assert.equal(hasPermission(ROLES.EDITOR, PERMISSIONS.ORDERS_CANCEL), false);
    assert.equal(hasPermission(ROLES.EDITOR, PERMISSIONS.ORDERS_REFUND), false);
    assert.equal(hasPermission(ROLES.EDITOR, PERMISSIONS.USERS_MANAGE), false);
    assert.equal(hasPermission(ROLES.EDITOR, PERMISSIONS.AUDIT_READ), false);
  });

  it('restricts VIEWER to read-only and report export permissions', () => {
    assert.equal(
      hasAllPermissions(ROLES.VIEWER, [
        PERMISSIONS.PRODUCTS_READ,
        PERMISSIONS.INVENTORY_READ,
        PERMISSIONS.ORDERS_READ,
        PERMISSIONS.ANALYTICS_READ,
        PERMISSIONS.REPORTS_EXPORT,
      ]),
      true,
    );
    assert.equal(hasPermission(ROLES.VIEWER, PERMISSIONS.PRODUCTS_WRITE), false);
    assert.equal(hasPermission(ROLES.VIEWER, PERMISSIONS.ORDERS_WRITE), false);
    assert.equal(hasPermission(ROLES.VIEWER, PERMISSIONS.INVENTORY_ADJUST), false);
  });
});

describe('@omni-ops/shared — Order State Machine', () => {
  it('allows valid forward lifecycle transitions (PENDING -> CONFIRMED -> SHIPPED -> DELIVERED -> REFUNDED)', () => {
    assert.equal(canTransitionOrderStatus(ORDER_STATUSES.PENDING, ORDER_STATUSES.CONFIRMED), true);
    assert.equal(canTransitionOrderStatus(ORDER_STATUSES.CONFIRMED, ORDER_STATUSES.SHIPPED), true);
    assert.equal(canTransitionOrderStatus(ORDER_STATUSES.SHIPPED, ORDER_STATUSES.DELIVERED), true);
    assert.equal(canTransitionOrderStatus(ORDER_STATUSES.DELIVERED, ORDER_STATUSES.REFUNDED), true);
  });

  it('allows cancellation before shipment (PENDING/CONFIRMED) and blocks after SHIPPED', () => {
    assert.equal(canTransitionOrderStatus(ORDER_STATUSES.PENDING, ORDER_STATUSES.CANCELLED), true);
    assert.equal(canTransitionOrderStatus(ORDER_STATUSES.CONFIRMED, ORDER_STATUSES.CANCELLED), true);
    assert.equal(canTransitionOrderStatus(ORDER_STATUSES.SHIPPED, ORDER_STATUSES.CANCELLED), false);
    assert.equal(canTransitionOrderStatus(ORDER_STATUSES.DELIVERED, ORDER_STATUSES.CANCELLED), false);
  });

  it('treats CANCELLED and REFUNDED as terminal states and requires reasons', () => {
    assert.deepEqual(ALLOWED_ORDER_TRANSITIONS[ORDER_STATUSES.CANCELLED], []);
    assert.deepEqual(ALLOWED_ORDER_TRANSITIONS[ORDER_STATUSES.REFUNDED], []);
    assert.equal(requiresTransitionReason(ORDER_STATUSES.CANCELLED), true);
    assert.equal(requiresTransitionReason(ORDER_STATUSES.REFUNDED), true);
    assert.equal(requiresTransitionReason(ORDER_STATUSES.SHIPPED), false);
  });
});

describe('@omni-ops/shared — Zod DTO Validation Contracts', () => {
  it('enforces non-negative pricing and uppercase SKU formatting in createProductSchema', () => {
    const valid = createProductSchema.safeParse({
      sku: 'prd-9901',
      name: 'Industrial Sensor X1',
      categoryId: '11111111-1111-4111-8111-111111111111',
      unitCost: 50,
      unitPrice: 75,
    });
    assert.equal(valid.success, true);
    assert.equal(valid.data.sku, 'PRD-9901');

    const negativeCost = createProductSchema.safeParse({
      sku: 'PRD-9902',
      name: 'Invalid Negative Cost',
      categoryId: '11111111-1111-4111-8111-111111111111',
      unitCost: -10,
      unitPrice: 80,
    });
    assert.equal(negativeCost.success, false);
  });

  it('prevents same-warehouse transfers in transferStockSchema', () => {
    const sameWh = '22222222-2222-4222-8222-222222222222';
    const res = transferStockSchema.safeParse({
      productId: '11111111-1111-4111-8111-111111111111',
      fromWarehouseId: sameWh,
      toWarehouseId: sameWh,
      quantity: 10,
      reason: 'Rebalance attempt',
    });
    assert.equal(res.success, false);
  });

  it('caps bulk order actions at 100 items and validates export payloads', () => {
    const over100Ids = Array.from({ length: 101 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const bulkRes = bulkOrderStatusSchema.safeParse({
      ids: over100Ids,
      toStatus: ORDER_STATUSES.CONFIRMED,
    });
    assert.equal(bulkRes.success, false);

    const exportRes = createExportSchema.safeParse({
      reportType: 'orders',
      format: 'XLSX',
      scope: 'all_filtered',
    });
    assert.equal(exportRes.success, true);

    const orderRes = createOrderSchema.safeParse({
      customerId: '11111111-1111-4111-8111-111111111111',
      warehouseId: '22222222-2222-4222-8222-222222222222',
      items: [{ productId: '33333333-3333-4333-8333-333333333333', quantity: 3 }],
    });
    assert.equal(orderRes.success, true);
  });
});
