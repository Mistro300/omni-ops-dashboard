import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  StockMovementType,
  StockReferenceType,
  UserRole,
} from '@prisma/client';
import type {
  AdjustStockInput,
  CursorPaginatedResponse,
  InventoryLevelDto,
  InventoryQuery,
  OffsetPaginatedResponse,
  StockMovementDto,
  StockMovementsQuery,
  TransferStockInput,
} from '@omni-ops/shared';
import { lockInventoryLevelsOrdered } from '../../prisma/inventory-lock.helper';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { computeStockHealth } from '../products/products.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async listLevels(query: InventoryQuery): Promise<OffsetPaginatedResponse<InventoryLevelDto>> {
    const where: Prisma.InventoryLevelWhereInput = {
      product: { deletedAt: null },
    };

    if (query.warehouseId) {
      where.warehouseId = query.warehouseId;
    }
    if (query.productId) {
      where.productId = query.productId;
    }
    if (query.q) {
      where.product = {
        deletedAt: null,
        OR: [
          { sku: { contains: query.q, mode: 'insensitive' } },
          { name: { contains: query.q, mode: 'insensitive' } },
        ],
      };
    }

    if (query.stockHealth) {
      const whSql = query.warehouseId
        ? Prisma.sql`AND il.warehouse_id = ${query.warehouseId}::uuid`
        : Prisma.empty;

      const healthSql =
        query.stockHealth === 'OUT_OF_STOCK'
          ? Prisma.sql`(il.quantity_on_hand - il.quantity_reserved) <= 0`
          : query.stockHealth === 'LOW_STOCK'
            ? Prisma.sql`(il.quantity_on_hand - il.quantity_reserved) > 0 AND (il.quantity_on_hand - il.quantity_reserved) <= il.reorder_point`
            : Prisma.sql`(il.quantity_on_hand - il.quantity_reserved) > il.reorder_point`;

      const matchedIds = await this.prisma.raw.$queryRaw<Array<{ id: string }>>`
        SELECT il.id
        FROM inventory_levels il
        INNER JOIN products p ON p.id = il.product_id AND p.deleted_at IS NULL
        WHERE ${healthSql} ${whSql}
      `;
      where.id = { in: matchedIds.map((r) => r.id) };
    }

    const skip = (query.page - 1) * query.limit;
    const orderBy: Prisma.InventoryLevelOrderByWithRelationInput = {
      [query.sortBy]: query.sortDir,
    };

    const [total, rows] = await Promise.all([
      this.prisma.raw.inventoryLevel.count({ where }),
      this.prisma.raw.inventoryLevel.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        include: {
          product: { select: { sku: true, name: true } },
          warehouse: { select: { code: true, name: true } },
        },
      }),
    ]);

    const data: InventoryLevelDto[] = rows.map((row) => {
      const available = row.quantityOnHand - row.quantityReserved;
      return {
        id: row.id,
        productId: row.productId,
        productSku: row.product.sku,
        productName: row.product.name,
        warehouseId: row.warehouseId,
        warehouseCode: row.warehouse.code,
        warehouseName: row.warehouse.name,
        quantityOnHand: row.quantityOnHand,
        quantityReserved: row.quantityReserved,
        quantityAvailable: available,
        reorderPoint: row.reorderPoint,
        stockHealth: computeStockHealth(available, row.reorderPoint),
        version: row.version,
        updatedAt: row.updatedAt.toISOString(),
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

  private async maybeEmitLowStockNotification(
    tx: Prisma.TransactionClient,
    params: {
      productId: string;
      productSku: string;
      warehouseId: string;
      warehouseCode: string;
      available: number;
      reorderPoint: number;
    },
  ) {
    if (params.available > params.reorderPoint) return;

    const admins = await tx.user.findMany({
      where: { role: UserRole.ADMIN, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (admins.length === 0) return;

    const isOut = params.available <= 0;
    await tx.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: isOut ? NotificationType.OUT_OF_STOCK : NotificationType.LOW_STOCK,
        title: isOut ? 'Out of Stock Alert' : 'Low Stock Threshold Alert',
        message: isOut
          ? `${params.productSku} in ${params.warehouseCode} reached 0 available units.`
          : `${params.productSku} in ${params.warehouseCode} dropped to ${params.available} available (reorder point: ${params.reorderPoint}).`,
        metadata: {
          productId: params.productId,
          warehouseId: params.warehouseId,
          available: params.available,
          reorderPoint: params.reorderPoint,
        },
      })),
    });
  }

  async adjustStock(
    dto: AdjustStockInput,
    actorId: string,
    ipAddress: string,
  ): Promise<InventoryLevelDto> {
    const [product, warehouse] = await Promise.all([
      this.prisma.db.product.findFirst({ where: { id: dto.productId } }),
      this.prisma.db.warehouse.findUnique({ where: { id: dto.warehouseId } }),
    ]);

    if (!product) throw new NotFoundException('Product not found');
    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const delta = dto.mode === 'ADD' ? dto.quantity : -dto.quantity;

    const updated = await this.prisma.raw.$transaction(async (tx) => {
      // Ensure row exists before taking ordered FOR UPDATE lock
      await tx.inventoryLevel.upsert({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.warehouseId,
          },
        },
        create: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          quantityOnHand: 0,
          quantityReserved: 0,
          reorderPoint: dto.reorderPoint ?? 10,
        },
        update: {},
      });

      const lockedRows = await lockInventoryLevelsOrdered(tx, [
        { productId: dto.productId, warehouseId: dto.warehouseId },
      ]);
      const locked = lockedRows[0];
      if (!locked) {
        throw new NotFoundException('Inventory level record not found');
      }

      const newOnHand = locked.quantity_on_hand + delta;
      if (newOnHand < 0) {
        throw new ConflictException(
          `Deduction would make on-hand stock negative (current on-hand: ${locked.quantity_on_hand}).`,
        );
      }
      if (newOnHand < locked.quantity_reserved) {
        throw new ConflictException(
          `Cannot deduct below reserved stock (${locked.quantity_reserved} units reserved; available: ${locked.quantity_on_hand - locked.quantity_reserved}).`,
        );
      }

      const nextReorderPoint = dto.reorderPoint ?? locked.reorder_point;

      const level = await tx.inventoryLevel.update({
        where: { id: locked.id },
        data: {
          quantityOnHand: newOnHand,
          reorderPoint: nextReorderPoint,
          version: { increment: 1 },
        },
      });

      const movementType =
        dto.mode === 'ADD' ? StockMovementType.ADJUSTMENT : StockMovementType.ADJUSTMENT;

      await tx.stockMovement.create({
        data: {
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          type: movementType,
          quantityDelta: delta,
          balanceAfter: newOnHand,
          referenceType: StockReferenceType.MANUAL,
          referenceId: `ADJ-${randomUUID().slice(0, 8).toUpperCase()}`,
          reason: dto.reason,
          performedBy: actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'INVENTORY_ADJUSTED',
          entityType: 'InventoryLevel',
          entityId: locked.id,
          beforeState: {
            productSku: product.sku,
            warehouseCode: warehouse.code,
            quantityOnHand: locked.quantity_on_hand,
            reorderPoint: locked.reorder_point,
          },
          afterState: {
            productSku: product.sku,
            warehouseCode: warehouse.code,
            quantityOnHand: newOnHand,
            quantityDelta: delta,
            reorderPoint: nextReorderPoint,
            reason: dto.reason,
          },
          ipAddress: ipAddress.slice(0, 64),
        },
      });

      await this.maybeEmitLowStockNotification(tx, {
        productId: product.id,
        productSku: product.sku,
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        available: newOnHand - locked.quantity_reserved,
        reorderPoint: nextReorderPoint,
      });

      return level;
    });

    await this.redis.invalidateByPrefix('analytics:');
    const available = updated.quantityOnHand - updated.quantityReserved;
    return {
      id: updated.id,
      productId: product.id,
      productSku: product.sku,
      productName: product.name,
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      quantityOnHand: updated.quantityOnHand,
      quantityReserved: updated.quantityReserved,
      quantityAvailable: available,
      reorderPoint: updated.reorderPoint,
      stockHealth: computeStockHealth(available, updated.reorderPoint),
      version: updated.version,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async transferStock(
    dto: TransferStockInput,
    actorId: string,
    ipAddress: string,
  ): Promise<{ referenceId: string; fromLevel: InventoryLevelDto; toLevel: InventoryLevelDto }> {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Source and destination warehouses must be different');
    }

    const [product, fromWh, toWh] = await Promise.all([
      this.prisma.db.product.findFirst({ where: { id: dto.productId } }),
      this.prisma.db.warehouse.findUnique({ where: { id: dto.fromWarehouseId } }),
      this.prisma.db.warehouse.findUnique({ where: { id: dto.toWarehouseId } }),
    ]);

    if (!product) throw new NotFoundException('Product not found');
    if (!fromWh) throw new NotFoundException('Source warehouse not found');
    if (!toWh) throw new NotFoundException('Destination warehouse not found');

    const referenceId = `TRF-${randomUUID().slice(0, 8).toUpperCase()}`;

    const { updatedFrom, updatedTo } = await this.prisma.raw.$transaction(async (tx) => {
      // Ensure both rows exist before canonical FOR UPDATE lock
      await tx.inventoryLevel.upsert({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.fromWarehouseId,
          },
        },
        create: {
          productId: dto.productId,
          warehouseId: dto.fromWarehouseId,
          quantityOnHand: 0,
          quantityReserved: 0,
        },
        update: {},
      });

      await tx.inventoryLevel.upsert({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.toWarehouseId,
          },
        },
        create: {
          productId: dto.productId,
          warehouseId: dto.toWarehouseId,
          quantityOnHand: 0,
          quantityReserved: 0,
        },
        update: {},
      });

      // Canonical ORDER BY product_id ASC, warehouse_id ASC FOR UPDATE prevents deadlocks
      const lockedRows = await lockInventoryLevelsOrdered(tx, [
        { productId: dto.productId, warehouseId: dto.fromWarehouseId },
        { productId: dto.productId, warehouseId: dto.toWarehouseId },
      ]);

      const lockedFrom = lockedRows.find((r) => r.warehouse_id === dto.fromWarehouseId);
      const lockedTo = lockedRows.find((r) => r.warehouse_id === dto.toWarehouseId);

      if (!lockedFrom || !lockedTo) {
        throw new NotFoundException('Unable to lock source and destination inventory rows');
      }

      const sourceAvailable = lockedFrom.quantity_on_hand - lockedFrom.quantity_reserved;
      if (sourceAvailable < dto.quantity) {
        throw new ConflictException(
          `Insufficient available stock in ${fromWh.code}. Available: ${sourceAvailable}, requested: ${dto.quantity}.`,
        );
      }

      const nextFromOnHand = lockedFrom.quantity_on_hand - dto.quantity;
      const nextToOnHand = lockedTo.quantity_on_hand + dto.quantity;

      const uFrom = await tx.inventoryLevel.update({
        where: { id: lockedFrom.id },
        data: { quantityOnHand: nextFromOnHand, version: { increment: 1 } },
      });

      const uTo = await tx.inventoryLevel.update({
        where: { id: lockedTo.id },
        data: { quantityOnHand: nextToOnHand, version: { increment: 1 } },
      });

      await tx.stockMovement.createMany({
        data: [
          {
            productId: dto.productId,
            warehouseId: dto.fromWarehouseId,
            type: StockMovementType.TRANSFER_OUT,
            quantityDelta: -dto.quantity,
            balanceAfter: nextFromOnHand,
            referenceType: StockReferenceType.TRANSFER,
            referenceId,
            reason: `Transfer to ${toWh.code}: ${dto.reason}`,
            performedBy: actorId,
          },
          {
            productId: dto.productId,
            warehouseId: dto.toWarehouseId,
            type: StockMovementType.TRANSFER_IN,
            quantityDelta: dto.quantity,
            balanceAfter: nextToOnHand,
            referenceType: StockReferenceType.TRANSFER,
            referenceId,
            reason: `Transfer from ${fromWh.code}: ${dto.reason}`,
            performedBy: actorId,
          },
        ],
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'INVENTORY_TRANSFERRED',
          entityType: 'InventoryTransfer',
          entityId: referenceId,
          beforeState: {
            productSku: product.sku,
            fromWarehouse: { code: fromWh.code, quantityOnHand: lockedFrom.quantity_on_hand },
            toWarehouse: { code: toWh.code, quantityOnHand: lockedTo.quantity_on_hand },
          },
          afterState: {
            productSku: product.sku,
            quantity: dto.quantity,
            fromWarehouse: { code: fromWh.code, quantityOnHand: nextFromOnHand },
            toWarehouse: { code: toWh.code, quantityOnHand: nextToOnHand },
            reason: dto.reason,
          },
          ipAddress: ipAddress.slice(0, 64),
        },
      });

      await this.maybeEmitLowStockNotification(tx, {
        productId: product.id,
        productSku: product.sku,
        warehouseId: fromWh.id,
        warehouseCode: fromWh.code,
        available: nextFromOnHand - lockedFrom.quantity_reserved,
        reorderPoint: lockedFrom.reorder_point,
      });

      return { updatedFrom: uFrom, updatedTo: uTo };
    });

    await this.redis.invalidateByPrefix('analytics:');

    const mapLevel = (
      lvl: typeof updatedFrom,
      wh: { id: string; code: string; name: string },
    ): InventoryLevelDto => {
      const avail = lvl.quantityOnHand - lvl.quantityReserved;
      return {
        id: lvl.id,
        productId: product.id,
        productSku: product.sku,
        productName: product.name,
        warehouseId: wh.id,
        warehouseCode: wh.code,
        warehouseName: wh.name,
        quantityOnHand: lvl.quantityOnHand,
        quantityReserved: lvl.quantityReserved,
        quantityAvailable: avail,
        reorderPoint: lvl.reorderPoint,
        stockHealth: computeStockHealth(avail, lvl.reorderPoint),
        version: lvl.version,
        updatedAt: lvl.updatedAt.toISOString(),
      };
    };

    return {
      referenceId,
      fromLevel: mapLevel(updatedFrom, fromWh),
      toLevel: mapLevel(updatedTo, toWh),
    };
  }

  async listMovements(
    query: StockMovementsQuery,
  ): Promise<CursorPaginatedResponse<StockMovementDto>> {
    const where: Prisma.StockMovementWhereInput = {};

    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.productId) where.productId = query.productId;
    if (query.type) where.type = query.type;

    if (query.fromDate || query.toDate) {
      where.createdAt = {
        ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
        ...(query.toDate
          ? {
              lte: new Date(
                query.toDate.length === 10 ? `${query.toDate}T23:59:59.999Z` : query.toDate,
              ),
            }
          : {}),
      };
    }

    if (query.q) {
      where.OR = [
        { referenceId: { contains: query.q, mode: 'insensitive' } },
        { reason: { contains: query.q, mode: 'insensitive' } },
        { product: { sku: { contains: query.q, mode: 'insensitive' } } },
        { product: { name: { contains: query.q, mode: 'insensitive' } } },
      ];
    }

    const rows = await this.prisma.raw.stockMovement.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        product: { select: { sku: true, name: true } },
        warehouse: { select: { code: true, name: true } },
        actor: { select: { fullName: true } },
      },
    });

    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (pageRows[pageRows.length - 1]?.id ?? null) : null;

    return {
      data: pageRows.map((m) => ({
        id: m.id,
        productId: m.productId,
        productSku: m.product.sku,
        productName: m.product.name,
        warehouseId: m.warehouseId,
        warehouseCode: m.warehouse.code,
        warehouseName: m.warehouse.name,
        type: m.type,
        quantityDelta: m.quantityDelta,
        balanceAfter: m.balanceAfter,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        reason: m.reason,
        performedById: m.performedBy,
        performedByName: m.actor.fullName,
        createdAt: m.createdAt.toISOString(),
      })),
      meta: {
        nextCursor,
        hasMore,
        limit: query.limit,
      },
    };
  }
}
