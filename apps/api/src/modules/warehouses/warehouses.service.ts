import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateWarehouseInput, UpdateWarehouseInput, WarehouseDto } from '@omni-ops/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<WarehouseDto[]> {
    const warehouses = await this.prisma.db.warehouse.findMany({
      orderBy: { code: 'asc' },
    });

    const sums = await this.prisma.raw.inventoryLevel.groupBy({
      by: ['warehouseId'],
      where: { product: { deletedAt: null } },
      _count: { _all: true },
      _sum: { quantityOnHand: true },
    });

    const sumMap = new Map(
      sums.map((s) => [
        s.warehouseId,
        { skuCount: s._count._all, totalUnits: s._sum.quantityOnHand ?? 0 },
      ]),
    );

    return warehouses.map((wh) => {
      const agg = sumMap.get(wh.id);
      return {
        id: wh.id,
        code: wh.code,
        name: wh.name,
        location: wh.location,
        isActive: wh.isActive,
        skuCount: agg?.skuCount ?? 0,
        totalUnits: agg?.totalUnits ?? 0,
        createdAt: wh.createdAt.toISOString(),
      };
    });
  }

  async create(dto: CreateWarehouseInput, actorId: string): Promise<WarehouseDto> {
    try {
      const created = await this.prisma.raw.$transaction(async (tx) => {
        const wh = await tx.warehouse.create({
          data: {
            code: dto.code,
            name: dto.name,
            location: dto.location,
            isActive: dto.isActive ?? true,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'WAREHOUSE_CREATED',
            entityType: 'Warehouse',
            entityId: wh.id,
            afterState: { code: wh.code, name: wh.name, location: wh.location, isActive: wh.isActive },
          },
        });
        return wh;
      });

      return {
        id: created.id,
        code: created.code,
        name: created.name,
        location: created.location,
        isActive: created.isActive,
        skuCount: 0,
        totalUnits: 0,
        createdAt: created.createdAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Warehouse code "${dto.code}" already exists.`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateWarehouseInput, actorId: string): Promise<WarehouseDto> {
    const existing = await this.prisma.db.warehouse.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Warehouse not found');

    try {
      const updated = await this.prisma.raw.$transaction(async (tx) => {
        const wh = await tx.warehouse.update({
          where: { id },
          data: {
            ...(dto.code !== undefined ? { code: dto.code } : {}),
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.location !== undefined ? { location: dto.location } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'WAREHOUSE_UPDATED',
            entityType: 'Warehouse',
            entityId: id,
            beforeState: {
              code: existing.code,
              name: existing.name,
              location: existing.location,
              isActive: existing.isActive,
            },
            afterState: {
              code: wh.code,
              name: wh.name,
              location: wh.location,
              isActive: wh.isActive,
            },
          },
        });
        return wh;
      });

      return {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        location: updated.location,
        isActive: updated.isActive,
        createdAt: updated.createdAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Warehouse code "${dto.code}" already exists.`);
      }
      throw err;
    }
  }
}
