import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createCategorySchema,
  PERMISSIONS,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@omni-ops/shared';
import {
  AuthenticatedUser,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CategoriesService } from './categories.service';

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @Get()
  @ApiOperation({ summary: 'List all product categories' })
  list() {
    return this.categoriesService.list();
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
  @Post()
  @ApiOperation({ summary: 'Create a product category' })
  create(
    @Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categoriesService.create(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a product category' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categoriesService.update(id, dto, user.id);
  }
}
