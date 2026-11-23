import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  BulkActionResult,
  BulkProductsStatusInput,
  CreateProductInput,
  OffsetPaginatedResponse,
  ProductDetailDto,
  ProductListItemDto,
  ProductsQuery,
  StockHealthFilter,
  UpdateProductInput,
} from '@omni-ops/shared';
import { PrismaService } from '../../prisma/prisma.service';

export function computeStockHealth(available: number, reorderPoint: number): StockHealthFilter {
  if (available <= 0) return 'OUT_OF_STOCK';
  if (available <= reorderPoint) return 'LOW_STOCK';
  return 'IN_STOCK';
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProductsQuery): Promise<OffsetPaginatedResponse<ProductListItemDto>> {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
    };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.unitPrice = {
        ...(query.minPrice !== undefined ? { gte: new Prisma.Decimal(query.minPrice) } : {}),
        ...(query.maxPrice !== undefined ? { lte: new Prisma.Decimal(query.maxPrice) } : {}),
      };
    }
    if (query.q) {
      where.OR = [
        { sku: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    // Filter by aggregated stockHealth directly in PostgreSQL for accurate pagination counts
    if (query.stockHealth) {
      const warehouseFilter = query.warehouseId
        ? Prisma.sql`AND il.warehouse_id = ${query.warehouseId}::uuid`
        : Prisma.empty;

      const havingClause =
        query.stockHealth === 'OUT_OF_STOCK'
          ? Prisma.sql`COALESCE(SUM(il.quantity_on_hand - il.quantity_reserved), 0) <= 0`
          : query.stockHealth === 'LOW_STOCK'
            ? Prisma.sql`COALESCE(SUM(il.quantity_on_hand - il.quantity_reserved), 0) > 0 AND COALESCE(SUM(il.quantity_on_hand - il.quantity_reserved), 0) <= COALESCE(SUM(il.reorder_point), 10)`
            : Prisma.sql`COALESCE(SUM(il.quantity_on_hand - il.quantity_reserved), 0) > COALESCE(SUM(il.reorder_point), 10)`;

      const matched = await this.prisma.raw.$queryRaw<Array<{ id: string }>>`
        SELECT p.id
        FROM products p
        LEFT JOIN inventory_levels il
          ON il.product_id = p.id ${warehouseFilter}
        WHERE p.deleted_at IS NULL
        GROUP BY p.id
        HAVING ${havingClause}
      `;

      where.id = { in: matched.map((m) => m.id) };
    }

    const skip = (query.page - 1) * query.limit;
    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [query.sortBy]: query.sortDir,
    };

    const [total, rows] = await Promise.all([
      this.prisma.db.product.count({ where }),
      this.prisma.db.product.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        include: {
          category: { select: { name: true } },
          inventoryLevels: {
            where: query.warehouseId ? { warehouseId: query.warehouseId } : undefined,
            select: {
              quantityOnHand: true,
              quantityReserved: true,
              reorderPoint: true,
            },
          },
        },
      }),
    ]);

    const data: ProductListItemDto[] = rows.map((p) => {
      const totalOnHand = p.inventoryLevels.reduce((acc, row) => acc + row.quantityOnHand, 0);
      const totalReserved = p.inventoryLevels.reduce((acc, row) => acc + row.quantityReserved, 0);
      const totalAvailable = totalOnHand - totalReserved;
      const totalReorder = p.inventoryLevels.reduce((acc, row) => acc + row.reorderPoint, 0) || 10;

      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        categoryId: p.categoryId,
        categoryName: p.category.name,
        unitCost: Number(p.unitCost),
        unitPrice: Number(p.unitPrice),
        isActive: p.isActive,
        totalOnHand,
        totalReserved,
        totalAvailable,
        stockHealth: computeStockHealth(totalAvailable, totalReorder),
        updatedAt: p.updatedAt.toISOString(),
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / query.limit));

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPreviousPage: query.page > 1,
      },
    };
  }

  async getById(id: string): Promise<ProductDetailDto> {
    const product = await this.prisma.db.product.findFirst({
      where: { id },
      include: {
        category: { select: { name: true } },
        inventoryLevels: {
          include: {
            warehouse: { select: { code: true, name: true } },
          },
          orderBy: { warehouse: { code: 'asc' } },
        },
        stockMovements: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 25,
          include: {
            warehouse: { select: { code: true } },
            actor: { select: { fullName: true } },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const totalOnHand = product.inventoryLevels.reduce((acc, r) => acc + r.quantityOnHand, 0);
    const totalReserved = product.inventoryLevels.reduce((acc, r) => acc + r.quantityReserved, 0);
    const totalAvailable = totalOnHand - totalReserved;
    const totalReorder = product.inventoryLevels.reduce((acc, r) => acc + r.reorderPoint, 0) || 10;

    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      categoryId: product.categoryId,
      categoryName: product.category.name,
      unitCost: Number(product.unitCost),
      unitPrice: Number(product.unitPrice),
      isActive: product.isActive,
      totalOnHand,
      totalReserved,
      totalAvailable,
      stockHealth: computeStockHealth(totalAvailable, totalReorder),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      inventoryByWarehouse: product.inventoryLevels.map((il) => {
        const available = il.quantityOnHand - il.quantityReserved;
        return {
          id: il.id,
          warehouseId: il.warehouseId,
          warehouseCode: il.warehouse.code,
          warehouseName: il.warehouse.name,
          quantityOnHand: il.quantityOnHand,
          quantityReserved: il.quantityReserved,
          quantityAvailable: available,
          reorderPoint: il.reorderPoint,
          stockHealth: computeStockHealth(available, il.reorderPoint),
          updatedAt: il.updatedAt.toISOString(),
        };
      }),
      recentMovements: product.stockMovements.map((m) => ({
        id: m.id,
        warehouseCode: m.warehouse.code,
        type: m.type,
        quantityDelta: m.quantityDelta,
        balanceAfter: m.balanceAfter,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        reason: m.reason,
        actorName: m.actor.fullName,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async create(dto: CreateProductInput, actorId: string, ipAddress: string): Promise<ProductDetailDto> {
    const category = await this.prisma.db.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) {
      throw new BadRequestException('Selected category does not exist');
    }

    try {
      const createdId = await this.prisma.raw.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            sku: dto.sku,
            name: dto.name,
            categoryId: dto.categoryId,
            unitCost: new Prisma.Decimal(dto.unitCost.toFixed(2)),
            unitPrice: new Prisma.Decimal(dto.unitPrice.toFixed(2)),
            isActive: dto.isActive ?? true,
          },
        });

        // Initialize 0-stock inventory levels across all active warehouses
        const activeWarehouses = await tx.warehouse.findMany({
          where: { isActive: true },
          select: { id: true },
        });
        if (activeWarehouses.length > 0) {
          await tx.inventoryLevel.createMany({
            data: activeWarehouses.map((wh) => ({
              productId: product.id,
              warehouseId: wh.id,
              quantityOnHand: 0,
              quantityReserved: 0,
              reorderPoint: dto.defaultReorderPoint ?? 10,
            })),
          });
        }

        await tx.auditLog.create({
          data: {
            actorId,
            action: 'PRODUCT_CREATED',
            entityType: 'Product',
            entityId: product.id,
            afterState: {
              sku: product.sku,
              name: product.name,
              unitCost: dto.unitCost,
              unitPrice: dto.unitPrice,
              isActive: product.isActive,
            },
            ipAddress: ipAddress.slice(0, 64),
          },
        });

        return product.id;
      });

      return this.getById(createdId);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Active product with SKU "${dto.sku}" already exists.`);
      }
      throw err;
    }
  }

  async update(
    id: string,
    dto: UpdateProductInput,
    actorId: string,
    ipAddress: string,
  ): Promise<ProductDetailDto> {
    const existing = await this.prisma.db.product.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    if (dto.categoryId) {
      const cat = await this.prisma.db.category.findUnique({ where: { id: dto.categoryId } });
      if (!cat) throw new BadRequestException('Selected category does not exist');
    }

    try {
      await this.prisma.raw.$transaction(async (tx) => {
        const updated = await tx.product.update({
          where: { id },
          data: {
            ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
            ...(dto.unitCost !== undefined
              ? { unitCost: new Prisma.Decimal(dto.unitCost.toFixed(2)) }
              : {}),
            ...(dto.unitPrice !== undefined
              ? { unitPrice: new Prisma.Decimal(dto.unitPrice.toFixed(2)) }
              : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });

        await tx.auditLog.create({
          data: {
            actorId,
            action: 'PRODUCT_UPDATED',
            entityType: 'Product',
            entityId: id,
            beforeState: {
              sku: existing.sku,
              name: existing.name,
              unitCost: Number(existing.unitCost),
              unitPrice: Number(existing.unitPrice),
              isActive: existing.isActive,
            },
            afterState: {
              sku: updated.sku,
              name: updated.name,
              unitCost: Number(updated.unitCost),
              unitPrice: Number(updated.unitPrice),
              isActive: updated.isActive,
            },
            ipAddress: ipAddress.slice(0, 64),
          },
        });
      });

      return this.getById(id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Active product with SKU "${dto.sku}" already exists.`);
      }
      throw err;
    }
  }

  async softDelete(id: string, actorId: string, ipAddress: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.db.product.findFirst({
      where: { id },
      include: { inventoryLevels: { select: { quantityReserved: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Product not found');
    }

    const totalReserved = existing.inventoryLevels.reduce((acc, r) => acc + r.quantityReserved, 0);
    if (totalReserved > 0) {
      throw new ConflictException(
        `Cannot delete product "${existing.sku}" while ${totalReserved} units are reserved in active orders.`,
      );
    }

    await this.prisma.raw.$transaction([
      this.prisma.raw.product.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      }),
      this.prisma.raw.auditLog.create({
        data: {
          actorId,
          action: 'PRODUCT_DELETED',
          entityType: 'Product',
          entityId: id,
          beforeState: { sku: existing.sku, name: existing.name, isActive: existing.isActive },
          afterState: { deleted: true },
          ipAddress: ipAddress.slice(0, 64),
        },
      }),
    ]);

    return { deleted: true };
  }

  async bulkUpdateStatus(
    dto: BulkProductsStatusInput,
    actorId: string,
    ipAddress: string,
  ): Promise<BulkActionResult> {
    const uniqueIds = Array.from(new Set(dto.ids));
    const existingRows = await this.prisma.db.product.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, sku: true, isActive: true },
    });
    const existingMap = new Map(existingRows.map((r) => [r.id, r]));

    const succeededIds: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const id of uniqueIds) {
      const row = existingMap.get(id);
      if (!row) {
        failed.push({ id, reason: 'Product not found or already deleted' });
        continue;
      }
      if (row.isActive === dto.isActive) {
        failed.push({
          id,
          reason: `Product ${row.sku} is already ${dto.isActive ? 'active' : 'inactive'}`,
        });
        continue;
      }
      succeededIds.push(id);
    }

    if (succeededIds.length > 0) {
      await this.prisma.raw.$transaction([
        this.prisma.raw.product.updateMany({
          where: { id: { in: succeededIds } },
          data: { isActive: dto.isActive },
        }),
        this.prisma.raw.auditLog.create({
          data: {
            actorId,
            action: 'PRODUCTS_BULK_STATUS_UPDATED',
            entityType: 'Product',
            entityId: `bulk:${succeededIds.length}`,
            afterState: {
              isActive: dto.isActive,
              succeededCount: succeededIds.length,
              failedCount: failed.length,
            },
            ipAddress: ipAddress.slice(0, 64),
          },
        }),
      ]);
    }

    return { succeededIds, failed };
  }
}
