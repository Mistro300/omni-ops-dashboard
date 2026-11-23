import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createWarehouseSchema,
  PERMISSIONS,
  updateWarehouseSchema,
  type CreateWarehouseInput,
  type UpdateWarehouseInput,
} from '@omni-ops/shared';
import {
  AuthenticatedUser,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { WarehousesService } from './warehouses.service';

@ApiTags('Warehouses')
@ApiBearerAuth()
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @RequirePermissions(PERMISSIONS.WAREHOUSES_READ)
  @Get()
  @ApiOperation({ summary: 'List all warehouses with inventory summaries' })
  list() {
    return this.warehousesService.list();
  }

  @RequirePermissions(PERMISSIONS.WAREHOUSES_MANAGE)
  @Post()
  @ApiOperation({ summary: 'Create a warehouse (Admin only)' })
  create(
    @Body(new ZodValidationPipe(createWarehouseSchema)) dto: CreateWarehouseInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.warehousesService.create(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.WAREHOUSES_MANAGE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a warehouse (Admin only)' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWarehouseSchema)) dto: UpdateWarehouseInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.warehousesService.update(id, dto, user.id);
  }
}
