import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AuditLogDto,
  AuditLogsQuery,
  CursorPaginatedResponse,
  UserRole,
} from '@omni-ops/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditLogsQuery): Promise<CursorPaginatedResponse<AuditLogDto>> {
    const where: Prisma.AuditLogWhereInput = {};

    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = query.action;
    if (query.entityType) where.entityType = query.entityType;

    if (query.fromDate || query.toDate) {
      where.createdAt = {
        ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate
          ? {
              lte: new Date(
                query.toDate.length === 10 ? `${query.toDate}T23:59:59.999Z` : query.toDate,
              ),
            }
          : {}),
      };
    }

    if (query.q) {
      where.OR = [
        { action: { contains: query.q, mode: 'insensitive' } },
        { entityType: { contains: query.q, mode: 'insensitive' } },
        { entityId: { contains: query.q, mode: 'insensitive' } },
        { ipAddress: { contains: query.q, mode: 'insensitive' } },
        { actor: { fullName: { contains: query.q, mode: 'insensitive' } } },
        { actor: { email: { contains: query.q, mode: 'insensitive' } } },
      ];
    }

    const rows = await this.prisma.raw.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        actor: {
          select: { fullName: true, email: true, role: true },
        },
      },
    });

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null;

    return {
      data: pageRows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorName: row.actor.fullName,
        actorEmail: row.actor.email,
        actorRole: row.actor.role as UserRole,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        beforeState: (row.beforeState as Record<string, unknown> | null) ?? null,
        afterState: (row.afterState as Record<string, unknown> | null) ?? null,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: {
        nextCursor,
        hasMore,
        limit: query.limit,
      },
    };
  }

  async getFilterMetadata() {
    const [actions, entityTypes, actors] = await Promise.all([
      this.prisma.raw.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
      this.prisma.raw.auditLog.findMany({
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      }),
      this.prisma.db.user.findMany({
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);

    return {
      actions: actions.map((a) => a.action),
      entityTypes: entityTypes.map((e) => e.entityType),
      actors,
    };
  }
}
