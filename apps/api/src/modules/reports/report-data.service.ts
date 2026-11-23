import type { Writable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, StockMovementType } from '@prisma/client';
import {
  REPORT_COLUMN_DEFINITIONS,
  type CreateExportInput,
  type ExportReportType,
} from '@omni-ops/shared';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { computeStockHealth } from '../products/products.service';

const DB_STREAM_BATCH_SIZE = 1000;
const PDF_MAX_TABULAR_ROWS = 1000;

@Injectable()
export class ReportDataService {
  constructor(private readonly prisma: PrismaService) {}

  resolveColumns(
    reportType: ExportReportType,
    requested?: string[],
  ): Array<{ key: string; label: string }> {
    const defs = REPORT_COLUMN_DEFINITIONS[reportType];
    if (!requested || requested.length === 0) {
      return defs.map((d) => ({ key: d.key, label: d.labelEn }));
    }
    const allowedMap = new Map(defs.map((d) => [d.key, d.labelEn]));
    const filtered = requested
      .filter((k) => allowedMap.has(k))
      .map((k) => ({ key: k, label: allowedMap.get(k)! }));
    return filtered.length > 0 ? filtered : defs.map((d) => ({ key: d.key, label: d.labelEn }));
  }

  private buildProductsWhere(filters: Record<string, unknown>): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { deletedAt: null };
    if (typeof filters.categoryId === 'string' && filters.categoryId) {
      where.categoryId = filters.categoryId;
    }
    if (filters.isActive === 'true' || filters.isActive === true) where.isActive = true;
    if (filters.isActive === 'false' || filters.isActive === false) where.isActive = false;
    if (typeof filters.q === 'string' && filters.q.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { sku: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private buildInventoryWhere(filters: Record<string, unknown>): Prisma.InventoryLevelWhereInput {
    const where: Prisma.InventoryLevelWhereInput = { product: { deletedAt: null } };
    if (typeof filters.warehouseId === 'string' && filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }
    if (typeof filters.q === 'string' && filters.q.trim()) {
      const q = filters.q.trim();
      where.product = {
        deletedAt: null,
        OR: [
          { sku: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      };
    }
    return where;
  }

  private buildOrdersWhere(filters: Record<string, unknown>): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {};
    if (typeof filters.warehouseId === 'string' && filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }
    if (typeof filters.status === 'string' && filters.status) {
      const statuses = filters.status
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean) as OrderStatus[];
      if (statuses.length > 0) where.status = { in: statuses };
    }
    if (typeof filters.q === 'string' && filters.q.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  private buildMovementsWhere(filters: Record<string, unknown>): Prisma.StockMovementWhereInput {
    const where: Prisma.StockMovementWhereInput = {};
    if (typeof filters.warehouseId === 'string' && filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }
    if (typeof filters.type === 'string' && filters.type) {
      where.type = filters.type as StockMovementType;
    }
    if (typeof filters.q === 'string' && filters.q.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { referenceId: { contains: q, mode: 'insensitive' } },
        { reason: { contains: q, mode: 'insensitive' } },
        { product: { sku: { contains: q, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  async estimateRowCount(input: CreateExportInput): Promise<number> {
    const filters = input.filters ?? {};
    const pageLimit = Number(filters.limit) || 20;

    let total: number;
    switch (input.reportType) {
      case 'products':
        total = await this.prisma.db.product.count({ where: this.buildProductsWhere(filters) });
        break;
      case 'inventory':
        total = await this.prisma.raw.inventoryLevel.count({
          where: this.buildInventoryWhere(filters),
        });
        break;
      case 'orders':
        total = await this.prisma.raw.order.count({ where: this.buildOrdersWhere(filters) });
        break;
      case 'stock_movements':
        total = await this.prisma.raw.stockMovement.count({
          where: this.buildMovementsWhere(filters),
        });
        break;
    }

    if (input.scope === 'current_page') {
      return Math.min(total, Math.min(pageLimit, 100));
    }
    return total;
  }

  /**
   * Streams report rows in constant-memory 1,000-row batches from PostgreSQL.
   */
  async *iterateRows(
    input: CreateExportInput,
    maxRows?: number,
  ): AsyncGenerator<Record<string, unknown>> {
    const filters = input.filters ?? {};
    const isCurrentPage = input.scope === 'current_page';
    const page = Math.max(1, Number(filters.page) || 1);
    const pageLimit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const pageCap = isCurrentPage ? pageLimit : Number.MAX_SAFE_INTEGER;
    const hardCap = maxRows !== undefined ? Math.min(maxRows, pageCap) : pageCap;

    let yielded = 0;

    if (input.reportType === 'products') {
      const where = this.buildProductsWhere(filters);
      let skip = isCurrentPage ? (page - 1) * pageLimit : 0;
      const warehouseFilterId =
        typeof filters.warehouseId === 'string' && filters.warehouseId
          ? filters.warehouseId
          : undefined;

      while (yielded < hardCap) {
        const take = Math.min(DB_STREAM_BATCH_SIZE, hardCap - yielded);
        const batch = await this.prisma.db.product.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip,
          take,
          include: {
            category: { select: { name: true } },
            inventoryLevels: {
              where: warehouseFilterId ? { warehouseId: warehouseFilterId } : undefined,
              select: { quantityOnHand: true, quantityReserved: true },
            },
          },
        });
        if (batch.length === 0) break;

        for (const p of batch) {
          const onHand = p.inventoryLevels.reduce((a, r) => a + r.quantityOnHand, 0);
          const reserved = p.inventoryLevels.reduce((a, r) => a + r.quantityReserved, 0);
          yield {
            sku: p.sku,
            name: p.name,
            category: p.category.name,
            unitCost: Number(p.unitCost).toFixed(2),
            unitPrice: Number(p.unitPrice).toFixed(2),
            totalOnHand: onHand,
            totalAvailable: onHand - reserved,
            status: p.isActive ? 'ACTIVE' : 'INACTIVE',
          };
          yielded++;
          if (yielded >= hardCap) break;
        }
        skip += batch.length;
        if (isCurrentPage || batch.length < take) break;
      }
      return;
    }

    if (input.reportType === 'inventory') {
      const where = this.buildInventoryWhere(filters);
      let skip = isCurrentPage ? (page - 1) * pageLimit : 0;

      while (yielded < hardCap) {
        const take = Math.min(DB_STREAM_BATCH_SIZE, hardCap - yielded);
        const batch = await this.prisma.raw.inventoryLevel.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip,
          take,
          include: {
            product: { select: { sku: true, name: true } },
            warehouse: { select: { code: true } },
          },
        });
        if (batch.length === 0) break;

        for (const row of batch) {
          const avail = row.quantityOnHand - row.quantityReserved;
          yield {
            sku: row.product.sku,
            productName: row.product.name,
            warehouseCode: row.warehouse.code,
            quantityOnHand: row.quantityOnHand,
            quantityReserved: row.quantityReserved,
            quantityAvailable: avail,
            reorderPoint: row.reorderPoint,
            health: computeStockHealth(avail, row.reorderPoint),
          };
          yielded++;
          if (yielded >= hardCap) break;
        }
        skip += batch.length;
        if (isCurrentPage || batch.length < take) break;
      }
      return;
    }

    if (input.reportType === 'orders') {
      const where = this.buildOrdersWhere(filters);
      let cursorId: string | undefined;
      let skip = isCurrentPage ? (page - 1) * pageLimit : 0;

      while (yielded < hardCap) {
        const take = Math.min(DB_STREAM_BATCH_SIZE, hardCap - yielded);
        const batch = await this.prisma.raw.order.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          ...(isCurrentPage
            ? { skip, take }
            : cursorId
              ? { cursor: { id: cursorId }, skip: 1, take }
              : { take }),
          include: {
            customer: { select: { name: true } },
            warehouse: { select: { code: true } },
          },
        });
        if (batch.length === 0) break;

        for (const o of batch) {
          yield {
            orderNumber: o.orderNumber,
            customer: o.customer.name,
            warehouseCode: o.warehouse.code,
            status: o.status,
            subtotal: Number(o.subtotal).toFixed(2),
            taxAmount: Number(o.taxAmount).toFixed(2),
            totalAmount: Number(o.totalAmount).toFixed(2),
            createdAt: o.createdAt.toISOString().slice(0, 19).replace('T', ' '),
          };
          yielded++;
          if (yielded >= hardCap) break;
        }
        cursorId = batch[batch.length - 1]?.id;
        skip += batch.length;
        if (isCurrentPage || batch.length < take) break;
      }
      return;
    }

    // stock_movements (cursor-streamed)
    const where = this.buildMovementsWhere(filters);
    let cursorId: string | undefined;
    while (yielded < hardCap) {
      const take = Math.min(DB_STREAM_BATCH_SIZE, hardCap - yielded);
      const batch = await this.prisma.raw.stockMovement.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        take,
        include: {
          product: { select: { sku: true } },
          warehouse: { select: { code: true } },
          actor: { select: { fullName: true } },
        },
      });
      if (batch.length === 0) break;

      for (const m of batch) {
        yield {
          createdAt: m.createdAt.toISOString().slice(0, 19).replace('T', ' '),
          sku: m.product.sku,
          warehouseCode: m.warehouse.code,
          type: m.type,
          quantityDelta: m.quantityDelta,
          balanceAfter: m.balanceAfter,
          referenceId: m.referenceId ?? '',
          actor: m.actor.fullName,
          reason: m.reason ?? '',
        };
        yielded++;
        if (yielded >= hardCap) break;
      }
      cursorId = batch[batch.length - 1]?.id;
      if (isCurrentPage || batch.length < take) break;
    }
  }

  /**
   * True streaming ExcelJS WorkbookWriter: commits each row immediately into the
   * output stream so 25,000+ rows stream with flat memory usage.
   */
  async streamExcelToWritable(
    input: CreateExportInput,
    writable: Writable,
  ): Promise<{ rowCount: number }> {
    const columns = this.resolveColumns(input.reportType, input.columns);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: writable,
      useStyles: true,
      useSharedStrings: false,
    });

    const sheet = workbook.addWorksheet(input.reportType.toUpperCase());
    sheet.columns = columns.map((col) => ({
      header: col.label,
      key: col.key,
      width: Math.max(14, Math.min(34, col.label.length + 10)),
    }));

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.commit();

    let rowCount = 0;
    for await (const record of this.iterateRows(input)) {
      sheet.addRow(record).commit();
      rowCount++;
    }

    await sheet.commit();
    await workbook.commit();
    return { rowCount };
  }

  async collectRowsForPdf(input: CreateExportInput): Promise<{
    columns: Array<{ key: string; label: string }>;
    rows: Array<Record<string, unknown>>;
    truncated: boolean;
  }> {
    const columns = this.resolveColumns(input.reportType, input.columns);
    const rows: Array<Record<string, unknown>> = [];
    for await (const rec of this.iterateRows(input, PDF_MAX_TABULAR_ROWS + 1)) {
      rows.push(rec);
    }
    const truncated = rows.length > PDF_MAX_TABULAR_ROWS;
    return {
      columns,
      rows: truncated ? rows.slice(0, PDF_MAX_TABULAR_ROWS) : rows,
      truncated,
    };
  }
}
