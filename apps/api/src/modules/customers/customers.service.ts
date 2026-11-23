import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import type {
  CreateCustomerInput,
  CustomerListItemDto,
  CustomersQuery,
  OffsetPaginatedResponse,
  UpdateCustomerInput,
} from '@omni-ops/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CustomersQuery): Promise<OffsetPaginatedResponse<CustomerListItemDto>> {
    const where: Prisma.CustomerWhereInput = { deletedAt: null };
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { phone: { contains: query.q, mode: 'insensitive' } },
        { companyName: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const orderBy: Prisma.CustomerOrderByWithRelationInput = {
      [query.sortBy]: query.sortDir,
    };

    const [total, rows] = await Promise.all([
      this.prisma.db.customer.count({ where }),
      this.prisma.db.customer.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
      }),
    ]);

    const customerIds = rows.map((r) => r.id);
    const aggMap = new Map<string, { count: number; totalSpent: number }>();

    if (customerIds.length > 0) {
      const grouped = await this.prisma.raw.order.groupBy({
        by: ['customerId'],
        where: {
          customerId: { in: customerIds },
          status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
        },
        _count: { _all: true },
        _sum: { totalAmount: true },
      });

      for (const g of grouped) {
        aggMap.set(g.customerId, {
          count: g._count._all,
          totalSpent: Number(g._sum.totalAmount ?? 0),
        });
      }
    }

    const data: CustomerListItemDto[] = rows.map((c) => {
      const stats = aggMap.get(c.id);
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        companyName: c.companyName,
        orderCount: stats?.count ?? 0,
        totalSpent: stats?.totalSpent ?? 0,
        createdAt: c.createdAt.toISOString(),
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

  async create(dto: CreateCustomerInput, actorId: string, ipAddress: string): Promise<CustomerListItemDto> {
    const created = await this.prisma.raw.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone ?? null,
          companyName: dto.companyName ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'CUSTOMER_CREATED',
          entityType: 'Customer',
          entityId: customer.id,
          afterState: { name: customer.name, email: customer.email, companyName: customer.companyName },
          ipAddress: ipAddress.slice(0, 64),
        },
      });
      return customer;
    });

    return {
      id: created.id,
      name: created.name,
      email: created.email,
      phone: created.phone,
      companyName: created.companyName,
      orderCount: 0,
      totalSpent: 0,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async update(
    id: string,
    dto: UpdateCustomerInput,
    actorId: string,
    ipAddress: string,
  ): Promise<CustomerListItemDto> {
    const existing = await this.prisma.db.customer.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Customer not found');

    const updated = await this.prisma.raw.$transaction(async (tx) => {
      const customer = await tx.customer.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.companyName !== undefined ? { companyName: dto.companyName } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'CUSTOMER_UPDATED',
          entityType: 'Customer',
          entityId: id,
          beforeState: {
            name: existing.name,
            email: existing.email,
            phone: existing.phone,
            companyName: existing.companyName,
          },
          afterState: {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            companyName: customer.companyName,
          },
          ipAddress: ipAddress.slice(0, 64),
        },
      });
      return customer;
    });

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      companyName: updated.companyName,
      orderCount: 0,
      totalSpent: 0,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async softDelete(id: string, actorId: string, ipAddress: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.db.customer.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException('Customer not found');

    const openOrders = await this.prisma.raw.order.count({
      where: {
        customerId: id,
        status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED] },
      },
    });
    if (openOrders > 0) {
      throw new ConflictException(
        `Cannot delete customer while ${openOrders} unshipped order(s) remain active.`,
      );
    }

    await this.prisma.raw.$transaction([
      this.prisma.raw.customer.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      this.prisma.raw.auditLog.create({
        data: {
          actorId,
          action: 'CUSTOMER_DELETED',
          entityType: 'Customer',
          entityId: id,
          beforeState: { name: existing.name, email: existing.email },
          afterState: { deleted: true },
          ipAddress: ipAddress.slice(0, 64),
        },
      }),
    ]);

    return { deleted: true };
  }
}
