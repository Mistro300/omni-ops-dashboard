import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  PERMISSIONS,
  resetPasswordSchema,
  ROLE_PERMISSIONS,
  updateProfileSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type UpdateProfileInput,
} from '@omni-ops/shared';
import type { Request, Response } from 'express';
import {
  AuthenticatedUser,
  CurrentUser,
  Public,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService, REFRESH_COOKIE_NAME, type RequestMeta } from './auth.service';

@ApiTags('Auth & Sessions')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private extractMeta(req: Request): RequestMeta {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim() || req.ip || '127.0.0.1'
        : req.ip || '127.0.0.1';
    const userAgent = req.headers['user-agent'] ?? 'Unknown';
    return { ipAddress: ip, userAgent };
  }

  private setRefreshCookie(res: Response, token: string, maxAgeMs: number) {
    const isSecure = process.env.COOKIE_SECURE === 'true';
    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      path: '/',
      maxAge: maxAgeMs,
    });
  }

  private clearRefreshCookie(res: Response) {
    const isSecure = process.env.COOKIE_SECURE === 'true';
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      path: '/',
    });
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email/password and issue rotated refresh cookie' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, this.extractMeta(req));
    this.setRefreshCookie(res, result.refreshTokenPlain, result.maxAgeMs);
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token cookie and issue new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawCookie = (req.cookies as Record<string, string | undefined>)?.[REFRESH_COOKIE_NAME];
    try {
      const result = await this.authService.refresh(rawCookie, this.extractMeta(req));
      this.setRefreshCookie(res, result.refreshTokenPlain, result.maxAgeMs);
      return {
        accessToken: result.accessToken,
        user: result.user,
      };
    } catch (err) {
      this.clearRefreshCookie(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke current refresh token session and clear cookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawCookie = (req.cookies as Record<string, string | undefined>)?.[REFRESH_COOKIE_NAME];
    await this.authService.logout(rawCookie);
    this.clearRefreshCookie(res);
    return { loggedOut: true };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset token' })
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordInput,
    @Req() req: Request,
  ) {
    return this.authService.forgotPassword(dto, this.extractMeta(req));
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using issued token and revoke active sessions' })
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordInput,
    @Req() req: Request,
  ) {
    return this.authService.resetPassword(dto, this.extractMeta(req));
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get authenticated user profile and granted RBAC permissions' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id);
  }

  @ApiBearerAuth()
  @Get('context')
  @ApiOperation({ summary: 'Get shell context (active warehouses and recent notifications)' })
  context(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getAppContext(user.id);
  }

  @ApiBearerAuth()
  @Post('notifications/mark-all-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications for the current user as read' })
  markAllNotificationsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.markAllNotificationsRead(user.id);
  }

  @ApiBearerAuth()
  @Get('sessions')
  @ApiOperation({ summary: 'List active sessions for the signed-in user' })
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user.id, user.sessionId);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Revoke a specific active session' })
  revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('id') sessionId: string) {
    return this.authService.revokeSession(user.id, sessionId);
  }

  @ApiBearerAuth()
  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke all sessions other than the current one' })
  revokeOtherSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.revokeOtherSessions(user.id, user.sessionId);
  }

  @ApiBearerAuth()
  @Patch('profile')
  @ApiOperation({ summary: 'Update signed-in user display profile' })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileInput,
  ) {
    return this.authService.updateProfile(user.id, dto);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password and revoke other active sessions' })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordInput,
    @Req() req: Request,
  ) {
    return this.authService.changePassword(user.id, user.sessionId, dto, this.extractMeta(req));
  }

  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  @Get('rbac-matrix')
  @ApiOperation({ summary: 'Admin-only RBAC permission matrix endpoint' })
  rbacMatrix(@CurrentUser() user: AuthenticatedUser) {
    return {
      requestedBy: user.email,
      role: user.role,
      matrix: ROLE_PERMISSIONS,
    };
  }
}
