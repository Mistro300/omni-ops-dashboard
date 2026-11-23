import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_PERMISSIONS, type UserRole } from '@omni-ops/shared';
import * as jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser, IS_PUBLIC_KEY } from '../decorators/auth.decorators';

interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  sid: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const secret = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-in-production';

    let payload: AccessTokenPayload;
    try {
      payload = jwt.verify(token, secret) as AccessTokenPayload;
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired');
    }

    const user = await this.prisma.db.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Account has been suspended');
    }

    const role = user.role as UserRole;
    request.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role,
      status: user.status,
      permissions: ROLE_PERMISSIONS[role],
      sessionId: payload.sid,
    };

    return true;
  }
}
