import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import type {
  CreateUserInput,
  OffsetPaginatedResponse,
  UpdateUserInput,
  UserListItemDto,
  UserRole as SharedUserRole,
  UsersQuery,
} from '@omni-ops/shared';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: UsersQuery): Promise<OffsetPaginatedResponse<UserListItemDto>> {
    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (query.role) where.role = query.role as UserRole;
    if (query.status) where.status = query.status as UserStatus;
    if (query.q) {
      where.OR = [
        { fullName: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [query.sortBy]: query.sortDir,
    };

    const [total, rows] = await Promise.all([
      this.prisma.db.user.count({ where }),
      this.prisma.db.user.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        include: {
          _count: {
            select: {
              refreshTokens: {
                where: { revokedAt: null, expiresAt: { gt: new Date() } },
              },
            },
          },
        },
      }),
    ]);

    const data: UserListItemDto[] = rows.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role as SharedUserRole,
      status: u.status,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      activeSessionsCount: u._count.refreshTokens,
      createdAt: u.createdAt.toISOString(),
    }));

    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPreviousPage: query.page > 1,
      },
    };
  }

  async create(dto: CreateUserInput, actorId: string, ipAddress: string): Promise<UserListItemDto> {
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    try {
      const created = await this.prisma.raw.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            fullName: dto.fullName,
            role: dto.role as UserRole,
            status: UserStatus.ACTIVE,
            passwordHash,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'USER_CREATED',
            entityType: 'User',
            entityId: user.id,
            afterState: { email: user.email, fullName: user.fullName, role: user.role },
            ipAddress: ipAddress.slice(0, 64),
          },
        });
        return user;
      });

      return {
        id: created.id,
        email: created.email,
        fullName: created.fullName,
        role: created.role as SharedUserRole,
        status: created.status,
        lastLoginAt: null,
        activeSessionsCount: 0,
        createdAt: created.createdAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Active user with email "${dto.email}" already exists.`);
      }
      throw err;
    }
  }

  async update(
    id: string,
    dto: UpdateUserInput,
    actorId: string,
    ipAddress: string,
  ): Promise<UserListItemDto> {
    const existing = await this.prisma.db.user.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    if (id === actorId && dto.status === 'SUSPENDED') {
      throw new BadRequestException('You cannot suspend your own account.');
    }
    if (id === actorId && dto.role && dto.role !== 'ADMIN') {
      throw new BadRequestException('You cannot demote your own ADMIN role.');
    }

    const updated = await this.prisma.raw.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
          ...(dto.role !== undefined ? { role: dto.role as UserRole } : {}),
          ...(dto.status !== undefined ? { status: dto.status as UserStatus } : {}),
        },
      });

      // Suspending a user immediately revokes all their active sessions
      if (dto.status === 'SUSPENDED') {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId,
          action: dto.role && dto.role !== existing.role ? 'USER_ROLE_CHANGED' : 'USER_UPDATED',
          entityType: 'User',
          entityId: id,
          beforeState: {
            fullName: existing.fullName,
            role: existing.role,
            status: existing.status,
          },
          afterState: {
            fullName: user.fullName,
            role: user.role,
            status: user.status,
          },
          ipAddress: ipAddress.slice(0, 64),
        },
      });

      return user;
    });

    const activeSessionsCount = await this.prisma.raw.refreshToken.count({
      where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    return {
      id: updated.id,
      email: updated.email,
      fullName: updated.fullName,
      role: updated.role as SharedUserRole,
      status: updated.status,
      lastLoginAt: updated.lastLoginAt ? updated.lastLoginAt.toISOString() : null,
      activeSessionsCount,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async revokeAllSessions(
    id: string,
    actorId: string,
    ipAddress: string,
  ): Promise<{ revokedCount: number }> {
    const existing = await this.prisma.db.user.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    const res = await this.prisma.raw.$transaction(async (tx) => {
      const out = await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'USER_SESSIONS_REVOKED',
          entityType: 'User',
          entityId: id,
          afterState: { targetEmail: existing.email, revokedCount: out.count },
          ipAddress: ipAddress.slice(0, 64),
        },
      });
      return out;
    });

    return { revokedCount: res.count };
  }
}
