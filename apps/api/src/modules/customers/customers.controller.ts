import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createCustomerSchema,
  customersQuerySchema,
  PERMISSIONS,
  updateCustomerSchema,
  type CreateCustomerInput,
  type CustomersQuery,
  type UpdateCustomerInput,
} from '@omni-ops/shared';
import type { Request } from 'express';
import {
  AuthenticatedUser,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CustomersService } from './customers.service';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  private getIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    return typeof fwd === 'string'
      ? fwd.split(',')[0]?.trim() || req.ip || '127.0.0.1'
      : req.ip || '127.0.0.1';
  }

  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  @Get()
  @ApiOperation({ summary: 'List customers with order count & total spend' })
  list(@Query(new ZodValidationPipe(customersQuerySchema)) query: CustomersQuery) {
    return this.customersService.list(query);
  }

  @RequirePermissions(PERMISSIONS.CUSTOMERS_WRITE)
  @Post()
  @ApiOperation({ summary: 'Create a customer' })
  create(
    @Body(new ZodValidationPipe(createCustomerSchema)) dto: CreateCustomerInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.customersService.create(dto, user.id, this.getIp(req));
  }

  @RequirePermissions(PERMISSIONS.CUSTOMERS_WRITE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a customer' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) dto: UpdateCustomerInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.customersService.update(id, dto, user.id, this.getIp(req));
  }

  @RequirePermissions(PERMISSIONS.CUSTOMERS_DELETE)
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a customer (Admin only)' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.customersService.softDelete(id, user.id, this.getIp(req));
  }
}
