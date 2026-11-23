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
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  bulkProductsStatusSchema,
  createProductSchema,
  PERMISSIONS,
  productsQuerySchema,
  updateProductSchema,
  type BulkProductsStatusInput,
  type CreateProductInput,
  type ProductsQuery,
  type UpdateProductInput,
} from '@omni-ops/shared';
import type { Request } from 'express';
import {
  AuthenticatedUser,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ProductsService } from './products.service';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  private getIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    return typeof fwd === 'string' ? fwd.split(',')[0]?.trim() || req.ip || '127.0.0.1' : req.ip || '127.0.0.1';
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @Get()
  @ApiOperation({ summary: 'List products with server-side pagination, sorting & filtering' })
  list(@Query(new ZodValidationPipe(productsQuerySchema)) query: ProductsQuery) {
    return this.productsService.list(query);
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get product details with warehouse stock levels & recent movements' })
  getById(@Param('id') id: string) {
    return this.productsService.getById(id);
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
  @Post()
  @ApiOperation({ summary: 'Create product and initialize warehouse inventory levels' })
  create(
    @Body(new ZodValidationPipe(createProductSchema)) dto: CreateProductInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.productsService.create(dto, user.id, this.getIp(req));
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update product details' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) dto: UpdateProductInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.productsService.update(id, dto, user.id, this.getIp(req));
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_DELETE)
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a product (Admin only, blocks if units reserved)' })
  softDelete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.productsService.softDelete(id, user.id, this.getIp(req));
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
  @Post('bulk-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk activate/deactivate up to 100 products with partial-failure reporting' })
  bulkStatus(
    @Body(new ZodValidationPipe(bulkProductsStatusSchema)) dto: BulkProductsStatusInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.productsService.bulkUpdateStatus(dto, user.id, this.getIp(req));
  }
}
