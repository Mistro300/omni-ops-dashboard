import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CategoryDto, CreateCategoryInput, UpdateCategoryInput } from '@omni-ops/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<CategoryDto[]> {
    const rows = await this.prisma.db.category.findMany({
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            products: { where: { deletedAt: null } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      parentId: row.parentId,
      isActive: row.isActive,
      productCount: row._count.products,
    }));
  }

  async create(dto: CreateCategoryInput, actorId: string): Promise<CategoryDto> {
    try {
      const created = await this.prisma.raw.$transaction(async (tx) => {
        const cat = await tx.category.create({
          data: {
            name: dto.name,
            slug: dto.slug,
            parentId: dto.parentId ?? null,
            isActive: dto.isActive ?? true,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'CATEGORY_CREATED',
            entityType: 'Category',
            entityId: cat.id,
            afterState: { name: cat.name, slug: cat.slug, isActive: cat.isActive },
          },
        });
        return cat;
      });

      return {
        id: created.id,
        name: created.name,
        slug: created.slug,
        parentId: created.parentId,
        isActive: created.isActive,
        productCount: 0,
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Category slug "${dto.slug}" already exists.`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateCategoryInput, actorId: string): Promise<CategoryDto> {
    const existing = await this.prisma.db.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');

    try {
      const updated = await this.prisma.raw.$transaction(async (tx) => {
        const cat = await tx.category.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
            ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'CATEGORY_UPDATED',
            entityType: 'Category',
            entityId: id,
            beforeState: { name: existing.name, slug: existing.slug, isActive: existing.isActive },
            afterState: { name: cat.name, slug: cat.slug, isActive: cat.isActive },
          },
        });
        return cat;
      });

      return {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        parentId: updated.parentId,
        isActive: updated.isActive,
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Category slug "${dto.slug}" already exists.`);
      }
      throw err;
    }
  }
}
