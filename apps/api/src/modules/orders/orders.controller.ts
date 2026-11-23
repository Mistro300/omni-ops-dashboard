import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  bulkOrderStatusSchema,
  createOrderSchema,
  ordersQuerySchema,
  PERMISSIONS,
  transitionOrderStatusSchema,
  type BulkOrderStatusInput,
  type CreateOrderInput,
  type OrdersQuery,
  type TransitionOrderStatusInput,
} from '@omni-ops/shared';
import type { Request, Response } from 'express';
import {
  AuthenticatedUser,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  private getIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    return typeof fwd === 'string'
      ? fwd.split(',')[0]?.trim() || req.ip || '127.0.0.1'
      : req.ip || '127.0.0.1';
  }

  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  @Get()
  @ApiOperation({ summary: 'List orders with server-side pagination, sorting & multi-status filter' })
  list(@Query(new ZodValidationPipe(ordersQuerySchema)) query: OrdersQuery) {
    return this.ordersService.list(query);
  }

  @RequirePermissions(PERMISSIONS.ORDERS_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get order details with snapshotted items and vertical status timeline' })
  getById(@Param('id') id: string) {
    return this.ordersService.getById(id);
  }

  @RequirePermissions(PERMISSIONS.ORDERS_WRITE)
  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Optional unique key to guarantee idempotent order creation',
  })
  @ApiOperation({ summary: 'Create PENDING order with atomic stock reservation & Idempotency-Key' })
  async create(
    @Body(new ZodValidationPipe(createOrderSchema)) dto: CreateOrderInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const { order, replayed } = await this.ordersService.create(
      dto,
      user,
      this.getIp(req),
      idempotencyKey,
    );
    if (replayed) {
      res.setHeader('X-Idempotent-Replayed', 'true');
      res.status(HttpStatus.OK);
    } else {
      res.status(HttpStatus.CREATED);
    }
    return order;
  }

  @RequirePermissions(PERMISSIONS.ORDERS_WRITE)
  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition order status with atomic stock side-effects & timeline entry' })
  transitionStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transitionOrderStatusSchema)) dto: TransitionOrderStatusInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.ordersService.transitionStatus(id, dto, user, this.getIp(req));
  }

  @RequirePermissions(PERMISSIONS.ORDERS_WRITE)
  @Post('bulk-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk transition up to 100 orders returning structured partial failures' })
  bulkTransition(
    @Body(new ZodValidationPipe(bulkOrderStatusSchema)) dto: BulkOrderStatusInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.ordersService.bulkTransitionStatus(dto, user, this.getIp(req));
  }
}
