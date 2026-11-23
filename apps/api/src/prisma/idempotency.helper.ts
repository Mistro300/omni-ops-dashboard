import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface IdempotentExecutionResult<T> {
  replayed: boolean;
  statusCode: number;
  body: T;
}

export function hashIdempotencyPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');
}

/**
 * Executes a critical mutation (such as Order creation) inside an existing Prisma
 * transaction while enforcing idempotency via the `idempotency_keys` table.
 *
 * - Same `(key, userId)` + same payload hash -> replays stored response.
 * - Same `(key, userId)` + different payload hash -> throws 409 Conflict.
 */
export async function executeIdempotentInTx<T>(
  tx: Prisma.TransactionClient,
  params: {
    key: string;
    userId: string;
    payload: unknown;
    ttlHours?: number;
  },
  handler: () => Promise<{ statusCode: number; body: T }>,
): Promise<IdempotentExecutionResult<T>> {
  const requestHash = hashIdempotencyPayload(params.payload);

  const existing = await tx.idempotencyKey.findUnique({
    where: {
      key_userId: {
        key: params.key,
        userId: params.userId,
      },
    },
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency-Key was already used with a different request payload.',
      );
    }
    return {
      replayed: true,
      statusCode: existing.statusCode ?? 200,
      body: existing.responseBody as T,
    };
  }

  const result = await handler();
  const ttlMs = (params.ttlHours ?? 24) * 3_600_000;

  await tx.idempotencyKey.create({
    data: {
      key: params.key,
      userId: params.userId,
      requestHash,
      statusCode: result.statusCode,
      responseBody: result.body as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });

  return {
    replayed: false,
    statusCode: result.statusCode,
    body: result.body,
  };
}
