import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createUserSchema,
  PERMISSIONS,
  updateUserSchema,
  usersQuerySchema,
  type CreateUserInput,
  type UpdateUserInput,
  type UsersQuery,
} from '@omni-ops/shared';
import type { Request } from 'express';
import {
  AuthenticatedUser,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

@ApiTags('Users & Roles (Admin)')
@ApiBearerAuth()
@RequirePermissions(PERMISSIONS.USERS_MANAGE)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private getIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    return typeof fwd === 'string'
      ? fwd.split(',')[0]?.trim() || req.ip || '127.0.0.1'
      : req.ip || '127.0.0.1';
  }

  @Get()
  @ApiOperation({ summary: 'List users with role/status filters and active session counts' })
  list(@Query(new ZodValidationPipe(usersQuerySchema)) query: UsersQuery) {
    return this.usersService.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user account with assigned RBAC role' })
  create(
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.usersService.create(dto, actor.id, this.getIp(req));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user role, status, or display name' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.usersService.update(id, dto, actor.id, this.getIp(req));
  }

  @Post(':id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke all active sessions for a specific user' })
  revokeSessions(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.usersService.revokeAllSessions(id, actor.id, this.getIp(req));
  }
}
