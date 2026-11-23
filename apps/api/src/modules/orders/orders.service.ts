import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  OrderStatus,
  Prisma,
  StockMovementType,
  StockReferenceType,
  UserRole,
} from '@prisma/client';
import {
  canTransitionOrderStatus,
  hasPermission,
  ORDER_STATUSES,
  PERMISSIONS,
  requiresTransitionReason,
  type BulkActionResult,
  type BulkOrderStatusInput,
  type CreateOrderInput,
  type OffsetPaginatedResponse,
  type OrderDetailDto,
  type OrderListItemDto,
  type OrdersQuery,
  type OrderStatus as SharedOrderStatus,
  type TransitionOrderStatusInput,
} from '@omni-ops/shared';
import type { AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { executeIdempotentInTx } from '../../prisma/idempotency.helper';
import { lockInventoryLevelsOrdered } from '../../prisma/inventory-lock.helper';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const VALID_STATUS_SET = new Set<string>(Object.values(ORDER_STATUSES));

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private generateOrderNumber(): string {
    const year = new Date().getUTCFullYear();
    const suffix = randomBytes(4).toString('hex').toUpperCase();
    return `ORD-${year}-${suffix}`;
  }

  async list(query: OrdersQuery): Promise<OffsetPaginatedResponse<OrderListItemDto>> {
    const where: Prisma.OrderWhereInput = {};

    if (query.warehouseId) where.warehouseId = query.warehouseId;
    if (query.customerId) where.customerId = query.customerId;

    if (query.status) {
      const statuses = query.status
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => VALID_STATUS_SET.has(s)) as OrderStatus[];
      if (statuses.length > 0) {
        where.status = { in: statuses };
      }
    }

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

    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      where.totalAmount = {
        ...(query.minAmount !== undefined ? { gte: new Prisma.Decimal(query.minAmount) } : {}),
        ...(query.maxAmount !== undefined ? { lte: new Prisma.Decimal(query.maxAmount) } : {}),
      };
    }

    if (query.q) {
      where.OR = [
        { orderNumber: { contains: query.q, mode: 'insensitive' } },
        { customer: { name: { contains: query.q, mode: 'insensitive' } } },
        { customer: { companyName: { contains: query.q, mode: 'insensitive' } } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const orderBy: Prisma.OrderOrderByWithRelationInput = {
      [query.sortBy]: query.sortDir,
    };

    const [total, rows] = await Promise.all([
      this.prisma.raw.order.count({ where }),
      this.prisma.raw.order.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        include: {
          customer: { select: { name: true, companyName: true } },
          warehouse: { select: { code: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    const data: OrderListItemDto[] = rows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerId: o.customerId,
      customerName: o.customer.name,
      customerCompany: o.customer.companyName,
      warehouseId: o.warehouseId,
      warehouseCode: o.warehouse.code,
      warehouseName: o.warehouse.name,
      itemCount: o._count.items,
      subtotal: Number(o.subtotal),
      taxAmount: Number(o.taxAmount),
      discountAmount: Number(o.discountAmount),
      totalAmount: Number(o.totalAmount),
      status: o.status as SharedOrderStatus,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    }));

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

  async getById(id: string): Promise<OrderDetailDto> {
    const order = await this.prisma.raw.order.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, email: true, phone: true, companyName: true } },
        warehouse: { select: { code: true, name: true } },
        creator: { select: { fullName: true } },
        items: {
          include: {
            product: { select: { sku: true, name: true } },
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: {
            actor: { select: { fullName: true } },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: order.customer.name,
      customerCompany: order.customer.companyName,
      customerEmail: order.customer.email,
      customerPhone: order.customer.phone,
      warehouseId: order.warehouseId,
      warehouseCode: order.warehouse.code,
      warehouseName: order.warehouse.name,
      itemCount: order.items.length,
      subtotal: Number(order.subtotal),
      taxAmount: Number(order.taxAmount),
      discountAmount: Number(order.discountAmount),
      totalAmount: Number(order.totalAmount),
      status: order.status as SharedOrderStatus,
      cancellationReason: order.cancellationReason,
      restockedOnRefund: order.restockedOnRefund,
      createdByName: order.creator.fullName,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item) => {
        const price = Number(item.unitPriceSnapshot);
        return {
          id: item.id,
          productId: item.productId,
          productSku: item.product.sku,
          productName: item.product.name,
          quantity: item.quantity,
          unitPriceSnapshot: price,
          unitCostSnapshot: Number(item.unitCostSnapshot),
          lineTotal: Number((price * item.quantity).toFixed(2)),
        };
      }),
      statusHistory: order.statusHistory.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus as SharedOrderStatus | null,
        toStatus: h.toStatus as SharedOrderStatus,
        reason: h.reason,
        changedByName: h.actor.fullName,
        createdAt: h.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Creates a new PENDING order inside a single ACID transaction:
   * - Enforces transactional Idempotency-Key (if header supplied)
   * - Acquires canonical `ORDER BY product_id ASC, warehouse_id ASC FOR UPDATE` locks
   * - Reserves stock by incrementing `quantity_reserved` ONLY (`quantity_on_hand` unchanged)
   * - Snapshots unit_price & unit_cost
   * - Records initial `order_status_history` & `audit_logs`
   */
  async create(
    dto: CreateOrderInput,
    actor: AuthenticatedUser,
    ipAddress: string,
    idempotencyKey?: string,
  ): Promise<{ order: OrderDetailDto; replayed: boolean }> {
    const createOrderTx = async (tx: Prisma.TransactionClient): Promise<OrderDetailDto> => {
      const [customer, warehouse] = await Promise.all([
        tx.customer.findFirst({ where: { id: dto.customerId, deletedAt: null } }),
        tx.warehouse.findFirst({ where: { id: dto.warehouseId, isActive: true } }),
      ]);
      if (!customer) throw new NotFoundException('Customer not found');
      if (!warehouse) throw new NotFoundException('Active warehouse not found');

      const productIds = dto.items.map((i) => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, deletedAt: null, isActive: true },
      });
      if (products.length !== productIds.length) {
        throw new BadRequestException('One or more selected products are inactive or do not exist');
      }
      const productMap = new Map(products.map((p) => [p.id, p]));

      // Acquire deadlock-free canonical FOR UPDATE row locks on inventory_levels
      const lockedRows = await lockInventoryLevelsOrdered(
        tx,
        dto.items.map((i) => ({ productId: i.productId, warehouseId: dto.warehouseId })),
      );
      const lockedMap = new Map(lockedRows.map((r) => [r.product_id, r]));

      // Validate stock availability for EVERY item before mutating
      for (const item of dto.items) {
        const prod = productMap.get(item.productId)!;
        const locked = lockedMap.get(item.productId);
        const available = locked ? locked.quantity_on_hand - locked.quantity_reserved : 0;
        if (!locked || available < item.quantity) {
          throw new ConflictException(
            `Insufficient available stock for ${prod.sku} in ${warehouse.code}. Available: ${available}, requested: ${item.quantity}.`,
          );
        }
      }

      // Reserve stock: PENDING increases `quantity_reserved` ONLY
      let subtotal = 0;
      const itemRecords: Array<{
        productId: string;
        quantity: number;
        unitPriceSnapshot: Prisma.Decimal;
        unitCostSnapshot: Prisma.Decimal;
      }> = [];

      for (const item of dto.items) {
        const prod = productMap.get(item.productId)!;
        const locked = lockedMap.get(item.productId)!;

        await tx.inventoryLevel.update({
          where: { id: locked.id },
          data: {
            quantityReserved: { increment: item.quantity },
            version: { increment: 1 },
          },
        });

        const unitPrice = Number(prod.unitPrice);
        subtotal += unitPrice * item.quantity;

        itemRecords.push({
          productId: prod.id,
          quantity: item.quantity,
          unitPriceSnapshot: prod.unitPrice,
          unitCostSnapshot: prod.unitCost,
        });
      }

      const discount = Math.min(dto.discountAmount ?? 0, subtotal);
      const taxable = Math.max(0, subtotal - discount);
      const tax = Number((taxable * (dto.taxRate ?? 0.14)).toFixed(2));
      const total = Number((taxable + tax).toFixed(2));
      const orderNumber = this.generateOrderNumber();

      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          warehouseId: warehouse.id,
          status: OrderStatus.PENDING,
          subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
          discountAmount: new Prisma.Decimal(discount.toFixed(2)),
          taxAmount: new Prisma.Decimal(tax.toFixed(2)),
          totalAmount: new Prisma.Decimal(total.toFixed(2)),
          createdBy: actor.id,
          items: {
            create: itemRecords,
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: OrderStatus.PENDING,
              reason: 'Order created and stock reserved',
              changedBy: actor.id,
            },
          },
        },
        include: {
          customer: { select: { name: true, email: true, phone: true, companyName: true } },
          warehouse: { select: { code: true, name: true } },
          creator: { select: { fullName: true } },
          items: { include: { product: { select: { sku: true, name: true } } } },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
            include: { actor: { select: { fullName: true } } },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'ORDER_CREATED',
          entityType: 'Order',
          entityId: createdOrder.id,
          afterState: {
            orderNumber,
            warehouseCode: warehouse.code,
            status: OrderStatus.PENDING,
            itemCount: itemRecords.length,
            totalAmount: total,
          },
          ipAddress: ipAddress.slice(0, 64),
        },
      });

      return {
        id: createdOrder.id,
        orderNumber: createdOrder.orderNumber,
        customerId: createdOrder.customerId,
        customerName: createdOrder.customer.name,
        customerCompany: createdOrder.customer.companyName,
        customerEmail: createdOrder.customer.email,
        customerPhone: createdOrder.customer.phone,
        warehouseId: createdOrder.warehouseId,
        warehouseCode: createdOrder.warehouse.code,
        warehouseName: createdOrder.warehouse.name,
        itemCount: createdOrder.items.length,
        subtotal: Number(createdOrder.subtotal),
        taxAmount: Number(createdOrder.taxAmount),
        discountAmount: Number(createdOrder.discountAmount),
        totalAmount: Number(createdOrder.totalAmount),
        status: createdOrder.status as SharedOrderStatus,
        cancellationReason: createdOrder.cancellationReason,
        restockedOnRefund: createdOrder.restockedOnRefund,
        createdByName: createdOrder.creator.fullName,
        createdAt: createdOrder.createdAt.toISOString(),
        updatedAt: createdOrder.updatedAt.toISOString(),
        items: createdOrder.items.map((item) => {
          const price = Number(item.unitPriceSnapshot);
          return {
            id: item.id,
            productId: item.productId,
            productSku: item.product.sku,
            productName: item.product.name,
            quantity: item.quantity,
            unitPriceSnapshot: price,
            unitCostSnapshot: Number(item.unitCostSnapshot),
            lineTotal: Number((price * item.quantity).toFixed(2)),
          };
        }),
        statusHistory: createdOrder.statusHistory.map((h) => ({
          id: h.id,
          fromStatus: h.fromStatus as SharedOrderStatus | null,
          toStatus: h.toStatus as SharedOrderStatus,
          reason: h.reason,
          changedByName: h.actor.fullName,
          createdAt: h.createdAt.toISOString(),
        })),
      };
    };

    if (idempotencyKey && idempotencyKey.trim().length > 0) {
      const exec = await this.prisma.raw.$transaction((tx) =>
        executeIdempotentInTx<OrderDetailDto>(
          tx,
          {
            key: idempotencyKey.trim(),
            userId: actor.id,
            payload: dto,
            ttlHours: 24,
          },
          async () => ({
            statusCode: 201,
            body: await createOrderTx(tx),
          }),
        ),
      );
      if (!exec.replayed) {
        await this.redis.invalidateByPrefix('analytics:');
      }
      return { order: exec.body, replayed: exec.replayed };
    }

    const order = await this.prisma.raw.$transaction((tx) => createOrderTx(tx));
    await this.redis.invalidateByPrefix('analytics:');
    return { order, replayed: false };
  }

  private assertPermissionForTargetStatus(actor: AuthenticatedUser, toStatus: SharedOrderStatus) {
    if (toStatus === ORDER_STATUSES.CANCELLED && !hasPermission(actor.role, PERMISSIONS.ORDERS_CANCEL)) {
      throw new ForbiddenException('Cancelling orders requires orders:cancel permission (Admin only).');
    }
    if (toStatus === ORDER_STATUSES.REFUNDED && !hasPermission(actor.role, PERMISSIONS.ORDERS_REFUND)) {
      throw new ForbiddenException('Refunding orders requires orders:refund permission (Admin only).');
    }
    if (!hasPermission(actor.role, PERMISSIONS.ORDERS_WRITE)) {
      throw new ForbiddenException('Updating orders requires orders:write permission.');
    }
  }

  /**
   * Transitions an order through the strict state machine & executes exact stock side-effects:
   * - PENDING -> CONFIRMED: keeps `quantity_reserved`
   * - CONFIRMED -> SHIPPED: deducts `quantity_reserved` & `quantity_on_hand`, appends `OUT` StockMovement
   * - PENDING/CONFIRMED -> CANCELLED: releases `quantity_reserved`, stores `cancellation_reason`
   * - SHIPPED -> DELIVERED: completes fulfillment
   * - DELIVERED -> REFUNDED: stores reason; if `restock=true`, increments `quantity_on_hand` & appends `IN` StockMovement
   */
  async transitionStatus(
    orderId: string,
    dto: TransitionOrderStatusInput,
    actor: AuthenticatedUser,
    ipAddress: string,
  ): Promise<OrderDetailDto> {
    this.assertPermissionForTargetStatus(actor, dto.toStatus);

    if (requiresTransitionReason(dto.toStatus) && (!dto.reason || dto.reason.trim().length < 3)) {
      throw new BadRequestException('A reason (min 3 characters) is required for cancellation or refund.');
    }

    await this.prisma.raw.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          warehouse: { select: { code: true } },
          items: { include: { product: { select: { sku: true } } } },
        },
      });
      if (!order) throw new NotFoundException('Order not found');

      const fromStatus = order.status as SharedOrderStatus;
      const toStatus = dto.toStatus;

      if (!canTransitionOrderStatus(fromStatus, toStatus)) {
        throw new ConflictException(
          `Invalid order status transition from ${fromStatus} to ${toStatus}.`,
        );
      }

      const needsInventoryMutation =
        toStatus === ORDER_STATUSES.SHIPPED ||
        toStatus === ORDER_STATUSES.CANCELLED ||
        (toStatus === ORDER_STATUSES.REFUNDED && dto.restock !== false);

      if (needsInventoryMutation && order.items.length > 0) {
        const lockedRows = await lockInventoryLevelsOrdered(
          tx,
          order.items.map((item) => ({
            productId: item.productId,
            warehouseId: order.warehouseId,
          })),
        );
        const lockedMap = new Map(lockedRows.map((r) => [r.product_id, r]));

        const admins =
          toStatus === ORDER_STATUSES.SHIPPED
            ? await tx.user.findMany({
                where: { role: UserRole.ADMIN, status: 'ACTIVE', deletedAt: null },
                select: { id: true },
              })
            : [];

        for (const item of order.items) {
          const locked = lockedMap.get(item.productId);
          if (!locked) {
            throw new ConflictException(
              `Missing inventory level for ${item.product.sku} in ${order.warehouse.code}.`,
            );
          }

          if (toStatus === ORDER_STATUSES.SHIPPED) {
            const nextOnHand = locked.quantity_on_hand - item.quantity;
            const nextReserved = Math.max(0, locked.quantity_reserved - item.quantity);
            if (nextOnHand < 0 || nextOnHand < nextReserved) {
              throw new ConflictException(
                `Stock invariant violated while shipping ${item.product.sku} (onHand=${locked.quantity_on_hand}, reserved=${locked.quantity_reserved}, qty=${item.quantity}).`,
              );
            }

            await tx.inventoryLevel.update({
              where: { id: locked.id },
              data: {
                quantityOnHand: nextOnHand,
                quantityReserved: nextReserved,
                version: { increment: 1 },
              },
            });

            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                warehouseId: order.warehouseId,
                type: StockMovementType.OUT,
                quantityDelta: -item.quantity,
                balanceAfter: nextOnHand,
                referenceType: StockReferenceType.ORDER,
                referenceId: order.orderNumber,
                reason: `Dispatched for order ${order.orderNumber}`,
                performedBy: actor.id,
              },
            });

            const nextAvailable = nextOnHand - nextReserved;
            if (nextAvailable <= locked.reorder_point && admins.length > 0) {
              const isOut = nextAvailable <= 0;
              await tx.notification.createMany({
                data: admins.map((admin) => ({
                  userId: admin.id,
                  type: isOut ? NotificationType.OUT_OF_STOCK : NotificationType.LOW_STOCK,
                  title: isOut ? 'Out of Stock Alert' : 'Low Stock Threshold Alert',
                  message: `${item.product.sku} in ${order.warehouse.code} has ${nextAvailable} available after shipping ${order.orderNumber}.`,
                  metadata: {
                    orderId: order.id,
                    productId: item.productId,
                    warehouseId: order.warehouseId,
                  },
                })),
              });
            }
          } else if (toStatus === ORDER_STATUSES.CANCELLED) {
            // Release reservation only
            const nextReserved = Math.max(0, locked.quantity_reserved - item.quantity);
            await tx.inventoryLevel.update({
              where: { id: locked.id },
              data: {
                quantityReserved: nextReserved,
                version: { increment: 1 },
              },
            });
          } else if (toStatus === ORDER_STATUSES.REFUNDED && dto.restock !== false) {
            // Restock returned items into on-hand inventory
            const nextOnHand = locked.quantity_on_hand + item.quantity;
            await tx.inventoryLevel.update({
              where: { id: locked.id },
              data: {
                quantityOnHand: nextOnHand,
                version: { increment: 1 },
              },
            });

            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                warehouseId: order.warehouseId,
                type: StockMovementType.IN,
                quantityDelta: item.quantity,
                balanceAfter: nextOnHand,
                referenceType: StockReferenceType.REFUND,
                referenceId: order.orderNumber,
                reason: `Restocked from refunded order ${order.orderNumber}: ${dto.reason}`,
                performedBy: actor.id,
              },
            });
          }
        }
      }

      const isCancelOrRefund =
        toStatus === ORDER_STATUSES.CANCELLED || toStatus === ORDER_STATUSES.REFUNDED;

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: toStatus as OrderStatus,
          ...(isCancelOrRefund ? { cancellationReason: dto.reason?.trim() ?? null } : {}),
          ...(toStatus === ORDER_STATUSES.REFUNDED
            ? { restockedOnRefund: dto.restock !== false }
            : {}),
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: fromStatus as OrderStatus,
          toStatus: toStatus as OrderStatus,
          reason: dto.reason?.trim() || `Status transitioned to ${toStatus}`,
          changedBy: actor.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'ORDER_STATUS_CHANGED',
          entityType: 'Order',
          entityId: orderId,
          beforeState: {
            orderNumber: order.orderNumber,
            status: fromStatus,
          },
          afterState: {
            orderNumber: order.orderNumber,
            status: toStatus,
            reason: dto.reason?.trim() ?? null,
            ...(toStatus === ORDER_STATUSES.REFUNDED ? { restocked: dto.restock !== false } : {}),
          },
          ipAddress: ipAddress.slice(0, 64),
        },
      });
    });

    await this.redis.invalidateByPrefix('analytics:');
    return this.getById(orderId);
  }

  async bulkTransitionStatus(
    dto: BulkOrderStatusInput,
    actor: AuthenticatedUser,
    ipAddress: string,
  ): Promise<BulkActionResult> {
    this.assertPermissionForTargetStatus(actor, dto.toStatus);

    const uniqueIds = Array.from(new Set(dto.ids));
    const succeededIds: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const id of uniqueIds) {
      try {
        await this.transitionStatus(
          id,
          { toStatus: dto.toStatus, reason: dto.reason, restock: dto.restock ?? true },
          actor,
          ipAddress,
        );
        succeededIds.push(id);
      } catch (err) {
        failed.push({
          id,
          reason: err instanceof Error ? err.message : 'Transition failed',
        });
      }
    }

    return { succeededIds, failed };
  }
}
