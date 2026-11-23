import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ROLE_PERMISSIONS,
  type AuthUser,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SessionInfo,
  type UpdateProfileInput,
  type UserRole,
} from '@omni-ops/shared';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export const REFRESH_COOKIE_NAME = 'omniops_refresh';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface RequestMeta {
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private sha256(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private signAccessToken(userId: string, role: UserRole, sessionId: string): string {
    const secret = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-in-production';
    const expiresIn = (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as jwt.SignOptions['expiresIn'];
    return jwt.sign({ sub: userId, role, sid: sessionId }, secret, { expiresIn });
  }

  private toAuthUser(user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    status: string;
    lastLoginAt: Date | null;
  }): AuthUser {
    const role = user.role as UserRole;
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role,
      status: user.status as 'ACTIVE' | 'SUSPENDED',
      permissions: ROLE_PERMISSIONS[role],
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    };
  }

  async login(dto: LoginInput, meta: RequestMeta) {
    const rateKey = `rl:login:${meta.ipAddress}:${dto.email.toLowerCase()}`;
    const limit = await this.redis.checkRateLimit(rateKey, 10, 15 * 60);
    if (!limit.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Too many login attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.db.user.findFirst({
      where: {
        email: { equals: dto.email, mode: 'insensitive' },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const validPassword = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Your account has been suspended. Contact an administrator.');
    }

    // Successful authentication clears rate limit bucket
    await this.redis.resetKey(rateKey);

    const refreshTokenPlain = randomBytes(48).toString('base64url');
    const tokenHash = this.sha256(refreshTokenPlain);
    const familyId = randomUUID();
    const maxAgeMs = dto.rememberMe ? THIRTY_DAYS_MS : SEVEN_DAYS_MS;
    const expiresAt = new Date(Date.now() + maxAgeMs);

    const [updatedUser, session] = await this.prisma.raw.$transaction([
      this.prisma.raw.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.raw.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          familyId,
          userAgent: meta.userAgent.slice(0, 512),
          ipAddress: meta.ipAddress.slice(0, 64),
          expiresAt,
        },
      }),
    ]);

    const accessToken = this.signAccessToken(updatedUser.id, updatedUser.role as UserRole, session.id);

    return {
      accessToken,
      refreshTokenPlain,
      maxAgeMs,
      user: this.toAuthUser(updatedUser),
    };
  }

  async refresh(refreshTokenPlain: string | undefined, meta: RequestMeta) {
    if (!refreshTokenPlain) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const tokenHash = this.sha256(refreshTokenPlain);
    const existing = await this.prisma.raw.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // REUSE DETECTION: If a previously rotated/revoked token is replayed,
    // revoke the entire token family immediately and record an immutable audit event.
    if (existing.revokedAt !== null) {
      await this.prisma.raw.$transaction([
        this.prisma.raw.refreshToken.updateMany({
          where: { familyId: existing.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        this.prisma.raw.auditLog.create({
          data: {
            actorId: existing.userId,
            action: 'AUTH_TOKEN_REUSE_DETECTED',
            entityType: 'RefreshTokenFamily',
            entityId: existing.familyId,
            beforeState: { tokenId: existing.id, revokedAt: existing.revokedAt.toISOString() },
            afterState: { familyRevoked: true },
            ipAddress: meta.ipAddress.slice(0, 64),
          },
        }),
      ]);

      throw new UnauthorizedException(
        'Refresh token reuse detected. All sessions in this token family have been revoked.',
      );
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    if (existing.user.deletedAt !== null || existing.user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account is inactive or suspended');
    }

    // Atomic rotation: revoke old token & issue successor inside the same familyId
    const newPlain = randomBytes(48).toString('base64url');
    const newHash = this.sha256(newPlain);
    const remainingMs = Math.max(SEVEN_DAYS_MS, existing.expiresAt.getTime() - Date.now());
    const newExpiresAt = new Date(Date.now() + Math.min(remainingMs, THIRTY_DAYS_MS));

    const [, rotatedSession] = await this.prisma.raw.$transaction([
      this.prisma.raw.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.raw.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: newHash,
          familyId: existing.familyId,
          userAgent: meta.userAgent.slice(0, 512),
          ipAddress: meta.ipAddress.slice(0, 64),
          expiresAt: newExpiresAt,
        },
      }),
    ]);

    const accessToken = this.signAccessToken(
      existing.user.id,
      existing.user.role as UserRole,
      rotatedSession.id,
    );

    return {
      accessToken,
      refreshTokenPlain: newPlain,
      maxAgeMs: newExpiresAt.getTime() - Date.now(),
      user: this.toAuthUser(existing.user),
    };
  }

  async logout(refreshTokenPlain: string | undefined): Promise<void> {
    if (!refreshTokenPlain) return;
    const tokenHash = this.sha256(refreshTokenPlain);
    await this.prisma.raw.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getMe(userId: string): Promise<AuthUser> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.toAuthUser(user);
  }

  async getAppContext(userId: string) {
    const [warehouses, notifications] = await Promise.all([
      this.prisma.db.warehouse.findMany({
        where: { isActive: true },
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, location: true },
      }),
      this.prisma.db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);

    return {
      warehouses,
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  async markAllNotificationsRead(userId: string): Promise<{ updatedCount: number }> {
    const res = await this.prisma.raw.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updatedCount: res.count };
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionInfo[]> {
    const rows = await this.prisma.raw.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      isCurrent: row.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<{ revoked: boolean }> {
    const session = await this.prisma.raw.refreshToken.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });
    if (!session) {
      throw new NotFoundException('Active session not found');
    }

    await this.prisma.raw.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<{ revokedCount: number }> {
    const result = await this.prisma.raw.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        id: { not: currentSessionId },
      },
      data: { revokedAt: new Date() },
    });
    return { revokedCount: result.count };
  }

  async forgotPassword(dto: ForgotPasswordInput, meta: RequestMeta) {
    const rateKey = `rl:forgot:${meta.ipAddress}:${dto.email.toLowerCase()}`;
    const limit = await this.redis.checkRateLimit(rateKey, 5, 15 * 60);
    if (!limit.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Too many reset requests. Try again in ${limit.retryAfterSeconds} seconds.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.db.user.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' } },
    });

    let devResetToken: string | undefined;

    if (user && user.status === 'ACTIVE') {
      const plainToken = randomBytes(32).toString('hex');
      const tokenHash = this.sha256(plainToken);

      await this.prisma.raw.authToken.create({
        data: {
          userId: user.id,
          tokenHash,
          type: 'PASSWORD_RESET',
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });

      if (process.env.NODE_ENV !== 'production') {
        devResetToken = plainToken;
      }
    }

    return {
      message: 'If an active account exists for that email, password reset instructions have been issued.',
      ...(devResetToken ? { devResetToken } : {}),
    };
  }

  async resetPassword(dto: ResetPasswordInput, meta: RequestMeta) {
    const tokenHash = this.sha256(dto.token);
    const tokenRow = await this.prisma.raw.authToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !tokenRow ||
      tokenRow.type !== 'PASSWORD_RESET' ||
      tokenRow.usedAt !== null ||
      tokenRow.expiresAt.getTime() <= Date.now() ||
      tokenRow.user.deletedAt !== null
    ) {
      throw new BadRequestException('Reset token is invalid or has expired');
    }

    const newPasswordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });

    await this.prisma.raw.$transaction([
      this.prisma.raw.user.update({
        where: { id: tokenRow.userId },
        data: { passwordHash: newPasswordHash },
      }),
      this.prisma.raw.authToken.update({
        where: { id: tokenRow.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.raw.refreshToken.updateMany({
        where: { userId: tokenRow.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.raw.auditLog.create({
        data: {
          actorId: tokenRow.userId,
          action: 'PASSWORD_RESET_COMPLETED',
          entityType: 'User',
          entityId: tokenRow.userId,
          afterState: { allSessionsRevoked: true },
          ipAddress: meta.ipAddress.slice(0, 64),
        },
      }),
    ]);

    return { message: 'Password has been reset successfully. Please sign in with your new password.' };
  }

  async updateProfile(userId: string, dto: UpdateProfileInput): Promise<AuthUser> {
    const updated = await this.prisma.raw.user.update({
      where: { id: userId },
      data: { fullName: dto.fullName },
    });
    return this.toAuthUser(updated);
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    dto: ChangePasswordInput,
    meta: RequestMeta,
  ) {
    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const validCurrent = await argon2.verify(user.passwordHash, dto.currentPassword).catch(() => false);
    if (!validCurrent) {
      throw new BadRequestException('Current password is incorrect');
    }

    const newHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });

    await this.prisma.raw.$transaction([
      this.prisma.raw.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      }),
      this.prisma.raw.refreshToken.updateMany({
        where: { userId, revokedAt: null, id: { not: currentSessionId } },
        data: { revokedAt: new Date() },
      }),
      this.prisma.raw.auditLog.create({
        data: {
          actorId: userId,
          action: 'PASSWORD_CHANGED',
          entityType: 'User',
          entityId: userId,
          afterState: { otherSessionsRevoked: true },
          ipAddress: meta.ipAddress.slice(0, 64),
        },
      }),
    ]);

    return { message: 'Password updated successfully. Other active sessions have been signed out.' };
  }
}
