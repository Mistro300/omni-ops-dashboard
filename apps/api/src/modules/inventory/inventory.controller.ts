import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adjustStockSchema,
  inventoryQuerySchema,
  PERMISSIONS,
  stockMovementsQuerySchema,
  transferStockSchema,
  type AdjustStockInput,
  type InventoryQuery,
  type StockMovementsQuery,
  type TransferStockInput,
} from '@omni-ops/shared';
import type { Request } from 'express';
import {
  AuthenticatedUser,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory & Stock Ledger')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  private getIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    return typeof fwd === 'string' ? fwd.split(',')[0]?.trim() || req.ip || '127.0.0.1' : req.ip || '127.0.0.1';
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @Get()
  @ApiOperation({ summary: 'List inventory levels per product & warehouse with offset pagination' })
  listLevels(@Query(new ZodValidationPipe(inventoryQuerySchema)) query: InventoryQuery) {
    return this.inventoryService.listLevels(query);
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @Post('adjust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atomically adjust stock with FOR UPDATE lock & append-only ledger entry' })
  adjust(
    @Body(new ZodValidationPipe(adjustStockSchema)) dto: AdjustStockInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.inventoryService.adjustStock(dto, user.id, this.getIp(req));
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_TRANSFER)
  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deadlock-free inter-warehouse stock transfer with dual ledger entries' })
  transfer(
    @Body(new ZodValidationPipe(transferStockSchema)) dto: TransferStockInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.inventoryService.transferStock(dto, user.id, this.getIp(req));
  }

  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @Get('movements')
  @ApiOperation({ summary: 'Cursor-paginated immutable stock movements ledger' })
  listMovements(@Query(new ZodValidationPipe(stockMovementsQuerySchema)) query: StockMovementsQuery) {
    return this.inventoryService.listMovements(query);
  }
}
