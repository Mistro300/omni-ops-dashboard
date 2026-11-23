import { Prisma, PrismaClient } from '@prisma/client';

const SOFT_DELETABLE_MODELS = new Set(['User', 'Product', 'Customer']);

/**
 * Prisma Client Extension that automatically excludes soft-deleted rows (`deletedAt: null`)
 * on read queries for soft-deletable models (User, Product, Customer):
 * - findUnique / findUniqueOrThrow: verifies the returned row has `deletedAt === null`
 * - findFirst / findFirstOrThrow / findMany / count / aggregate / groupBy: injects `deletedAt: null`
 *
 * If a query explicitly passes `deletedAt` in `where` (e.g. archived views), that filter is honored.
 */
export const softDeleteExtension = Prisma.defineExtension({
  name: 'omniops-soft-delete',
  query: {
    $allModels: {
      async findUnique({ model, args, query }) {
        const result = (await query(args)) as { deletedAt?: Date | null } | null;
        if (SOFT_DELETABLE_MODELS.has(model) && result && result.deletedAt != null) {
          return null;
        }
        return result;
      },
      async findUniqueOrThrow({ model, args, query }) {
        const result = (await query(args)) as { deletedAt?: Date | null };
        if (SOFT_DELETABLE_MODELS.has(model) && result && result.deletedAt != null) {
          throw new Prisma.PrismaClientKnownRequestError(
            `No active ${model} found`,
            { code: 'P2025', clientVersion: Prisma.prismaVersion.client },
          );
        }
        return result;
      },
      async findFirst({ model, args, query }) {
        if (SOFT_DELETABLE_MODELS.has(model)) {
          args.where = applyActiveFilter(args.where);
        }
        return query(args);
      },
      async findFirstOrThrow({ model, args, query }) {
        if (SOFT_DELETABLE_MODELS.has(model)) {
          args.where = applyActiveFilter(args.where);
        }
        return query(args);
      },
      async findMany({ model, args, query }) {
        if (SOFT_DELETABLE_MODELS.has(model)) {
          args.where = applyActiveFilter(args.where);
        }
        return query(args);
      },
      async count({ model, args, query }) {
        if (SOFT_DELETABLE_MODELS.has(model)) {
          args.where = applyActiveFilter(args.where);
        }
        return query(args);
      },
      async aggregate({ model, args, query }) {
        if (SOFT_DELETABLE_MODELS.has(model)) {
          args.where = applyActiveFilter(args.where);
        }
        return query(args);
      },
      async groupBy({ model, args, query }) {
        if (SOFT_DELETABLE_MODELS.has(model)) {
          args.where = applyActiveFilter(args.where);
        }
        return query(args);
      },
    },
  },
});

function applyActiveFilter<T extends Record<string, unknown> | undefined>(
  where: T,
): T & { deletedAt?: unknown } {
  if (!where) {
    return { deletedAt: null } as T & { deletedAt?: unknown };
  }
  if ('deletedAt' in where) {
    return where;
  }
  return { ...where, deletedAt: null };
}

export function createExtendedPrismaClient(baseClient: PrismaClient) {
  return baseClient.$extends(softDeleteExtension);
}

export type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>;
