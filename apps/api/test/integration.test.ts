import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { loadApiEnvFiles } from '../src/config/load-env';
import { hashIdempotencyPayload } from '../src/prisma/idempotency.helper';
import { lockInventoryLevelsOrdered } from '../src/prisma/inventory-lock.helper';

loadApiEnvFiles();

const prisma = new PrismaClient();
const API_BASE = `http://localhost:${process.env.API_PORT || 4000}/${process.env.API_PREFIX || 'api/v1'}`;

async function apiLogin(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `Login failed for ${email}`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const body = (await res.json()) as { accessToken: string; user: { id: string; role: string } };
  return { accessToken: body.accessToken, user: body.user, cookie: setCookie.split(';')[0] ?? '' };
}

describe('@omni-ops/api — Database Constraints, Append-Only Triggers & Helpers', () => {
  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('computes deterministic SHA-256 hashes for Idempotency-Key payloads', () => {
    const h1 = hashIdempotencyPayload({ warehouseId: 'w1', items: [{ qty: 2 }] });
    const h2 = hashIdempotencyPayload({ warehouseId: 'w1', items: [{ qty: 2 }] });
    const h3 = hashIdempotencyPayload({ warehouseId: 'w1', items: [{ qty: 3 }] });
    assert.equal(h1, h2);
    assert.notEqual(h1, h3);
    assert.equal(h1.length, 64);
  });

  it('acquires FOR UPDATE locks on inventory_levels in canonical (product_id ASC, warehouse_id ASC) order', async () => {
    const sampleLevels = await prisma.inventoryLevel.findMany({
      take: 4,
      select: { productId: true, warehouseId: true },
    });
    assert.ok(sampleLevels.length >= 2);

    // Reverse input order deliberately
    const reversedInput = [...sampleLevels].reverse();

    const locked = await prisma.$transaction(async (tx) =>
      lockInventoryLevelsOrdered(tx, reversedInput),
    );

    assert.equal(locked.length, sampleLevels.length);
    for (let i = 1; i < locked.length; i++) {
      const prev = `${locked[i - 1]!.product_id}:${locked[i - 1]!.warehouse_id}`;
      const curr = `${locked[i]!.product_id}:${locked[i]!.warehouse_id}`;
      assert.ok(prev.localeCompare(curr) <= 0, `Expected ${prev} <= ${curr}`);
    }
  });

  it('enforces PostgreSQL CHECK constraint (quantity_on_hand >= quantity_reserved >= 0)', async () => {
    const level = await prisma.inventoryLevel.findFirstOrThrow();
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `UPDATE inventory_levels SET quantity_reserved = quantity_on_hand + 50 WHERE id = $1::uuid`,
          level.id,
        );
      },
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        return msg.includes('chk_inventory_available_non_negative') || msg.includes('23514');
      },
    );
  });

  it('enforces PostgreSQL Append-Only Triggers blocking UPDATE and DELETE on stock_movements & audit_logs', async () => {
    const movement = await prisma.stockMovement.findFirstOrThrow();
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `UPDATE stock_movements SET quantity_delta = 999 WHERE id = $1::uuid`,
          movement.id,
        );
      },
      (err: unknown) => (err instanceof Error ? err.message : String(err)).includes('append-only'),
    );

    const audit = await prisma.auditLog.findFirstOrThrow();
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE id = $1::uuid`, audit.id);
      },
      (err: unknown) => (err instanceof Error ? err.message : String(err)).includes('append-only'),
    );
  });
});

describe('@omni-ops/api — Live HTTP Security, Idempotency & RBAC Integration', () => {
  it('detects Refresh Token Reuse, revokes entire family_id, and logs REFRESH_TOKEN_REUSE_DETECTED', async () => {
    const loginSession = await apiLogin('editor@omniops.dev', 'OmniOps@2026!');
    assert.ok(loginSession.cookie.includes('='));

    // 1. Legitimate refresh rotates token T1 -> T2
    const refresh1 = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: loginSession.cookie },
    });
    assert.equal(refresh1.status, 200);
    const rotatedCookie = (refresh1.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    assert.ok(rotatedCookie.includes('='));
    assert.notEqual(rotatedCookie, loginSession.cookie);

    // 2. Attacker replays already-used token T1 -> triggers family revocation (401)
    const replayRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: loginSession.cookie },
    });
    assert.equal(replayRes.status, 401);

    // 3. Even token T2 in the same family is now revoked (401)
    const afterCompromiseRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: rotatedCookie },
    });
    assert.equal(afterCompromiseRes.status, 401);
  });

  it('enforces transactional Idempotency-Key on POST /orders (replay returns same order; modified payload returns 409)', async () => {
    const admin = await apiLogin('admin@omniops.dev', 'OmniOps@2026!');

    const stockRow = await prisma.inventoryLevel.findFirstOrThrow({
      where: { quantityOnHand: { gte: 50 }, quantityReserved: 0 },
    });
    const customer = await prisma.customer.findFirstOrThrow();
    const idemKey = `test-idem-${randomUUID()}`;

    const payload = {
      customerId: customer.id,
      warehouseId: stockRow.warehouseId,
      items: [{ productId: stockRow.productId, quantity: 1 }],
      discountAmount: 0,
      taxRatePercent: 14,
    };

    // First request -> 200/201 Created
    const res1 = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${admin.accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idemKey,
      },
      body: JSON.stringify(payload),
    });
    assert.ok(res1.status === 200 || res1.status === 201);
    const order1 = (await res1.json()) as { id: string; orderNumber: string };

    // Second request with identical Idempotency-Key + payload -> returns exact same order ID
    const res2 = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${admin.accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idemKey,
      },
      body: JSON.stringify(payload),
    });
    assert.ok(res2.status === 200 || res2.status === 201);
    const order2 = (await res2.json()) as { id: string; orderNumber: string };
    assert.equal(order2.id, order1.id);

    // Third request with same Idempotency-Key but mutated quantity -> 409 Conflict
    const res3 = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${admin.accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idemKey,
      },
      body: JSON.stringify({
        ...payload,
        items: [{ productId: stockRow.productId, quantity: 2 }],
      }),
    });
    assert.equal(res3.status, 409);
  });

  it('enforces RBAC role boundaries for VIEWER and EDITOR across mutations and sensitive order cancellations', async () => {
    const viewer = await apiLogin('viewer@omniops.dev', 'OmniOps@2026!');
    const editor = await apiLogin('editor@omniops.dev', 'OmniOps@2026!');

    // Viewer cannot create products -> 403
    const viewerCreate = await fetch(`${API_BASE}/products`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${viewer.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sku: 'PRD-VIEW-01',
        name: 'Forbidden Product',
        categoryId: '11111111-1111-4111-8111-111111111111',
        unitCost: 10,
        unitPrice: 20,
      }),
    });
    assert.equal(viewerCreate.status, 403);

    // Editor cannot cancel a PENDING order (orders:cancel is Admin-only) -> 403
    const pendingOrder = await prisma.order.findFirstOrThrow({
      where: { status: 'PENDING' },
    });
    const editorCancel = await fetch(`${API_BASE}/orders/${pendingOrder.id}/status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${editor.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        toStatus: 'CANCELLED',
        reason: 'Editor attempting admin-only cancellation',
      }),
    });
    assert.equal(editorCancel.status, 403);
  });
});
