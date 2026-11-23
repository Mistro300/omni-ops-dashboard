import { PassThrough } from 'node:stream';
import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  ExportFormat,
  ExportJobStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import type {
  CreateExportInput,
  ExportFormat as SharedExportFormat,
  ExportJobDto,
  ExportJobsQuery,
  ExportReportType,
  ExportStatus,
  OffsetPaginatedResponse,
} from '@omni-ops/shared';
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { AuthenticatedUser } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PdfRendererService } from './pdf-renderer.service';
import { ReportDataService } from './report-data.service';
import { StorageService } from './storage.service';

const EXPORT_QUEUE_NAME = 'omniops-exports';

interface ExportQueuePayload {
  jobId: string;
  userId: string;
  input: CreateExportInput;
}

function parseBullMqConnection(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: url.hostname || 'localhost',
    port: Number(url.port || 6379),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    maxRetriesPerRequest: null,
  };
}

@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsService.name);
  private readonly queue: Queue<ExportQueuePayload>;
  private readonly worker: Worker<ExportQueuePayload>;
  private cleanupTimer: NodeJS.Timeout | null = null;

  public readonly syncThreshold = Number(process.env.EXPORT_SYNC_ROW_THRESHOLD ?? 5000);
  public readonly linkTtlHours = Number(process.env.EXPORT_LINK_TTL_HOURS ?? 24);
  public readonly workerConcurrency = Math.min(
    4,
    Math.max(1, Number(process.env.EXPORT_WORKER_CONCURRENCY ?? 2)),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pdfRenderer: PdfRendererService,
    private readonly reportData: ReportDataService,
    private readonly ordersService: OrdersService,
  ) {
    const connection = parseBullMqConnection();
    this.queue = new Queue<ExportQueuePayload>(EXPORT_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    });

    // Isolated worker with bounded concurrency (default: 2) reusing single Playwright instance
    this.worker = new Worker<ExportQueuePayload>(
      EXPORT_QUEUE_NAME,
      (job) => this.processQueuedExport(job),
      {
        connection,
        concurrency: this.workerConcurrency,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Export job ${job?.data?.jobId ?? job?.id} failed: ${err.message}`);
    });
  }

  onModuleInit(): void {
    // Hourly cleanup cron for expired MinIO export files & expired idempotency keys
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredArtifacts();
    }, 60 * 60 * 1000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    await this.worker.close().catch(() => undefined);
    await this.queue.close().catch(() => undefined);
  }

  private toJobDto(row: {
    id: string;
    requestedBy: string;
    reportType: string;
    format: ExportFormat;
    status: ExportJobStatus;
    objectKey: string | null;
    errorMessage: string | null;
    rowCount: number | null;
    expiresAt: Date | null;
    createdAt: Date;
    requester?: { fullName: string };
  }): ExportJobDto {
    const isExpired = Boolean(row.expiresAt && row.expiresAt.getTime() <= Date.now());
    const canDownload =
      row.status === ExportJobStatus.COMPLETED && Boolean(row.objectKey) && !isExpired;
    return {
      id: row.id,
      requestedById: row.requestedBy,
      requestedByName: row.requester?.fullName ?? 'User',
      reportType: row.reportType as ExportReportType,
      format: row.format as SharedExportFormat,
      status: row.status as ExportStatus,
      rowCount: row.rowCount,
      errorMessage: row.errorMessage,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      isExpired,
      canDownload,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async generateOrderInvoicePdf(orderId: string): Promise<{ filename: string; buffer: Buffer }> {
    const order = await this.ordersService.getById(orderId);
    const buffer = await this.pdfRenderer.renderOrderInvoicePdf(order);
    return {
      filename: `Invoice-${order.orderNumber}.pdf`,
      buffer,
    };
  }

  async shouldRunAsync(input: CreateExportInput): Promise<{ isAsync: boolean; estimatedRows: number }> {
    const estimatedRows = await this.reportData.estimateRowCount(input);
    const isAsync = Boolean(input.forceAsync) || estimatedRows > this.syncThreshold;
    return { isAsync, estimatedRows };
  }

  async renderSyncReportBuffer(input: CreateExportInput): Promise<{
    buffer: Buffer;
    contentType: string;
    filename: string;
    rowCount: number;
  }> {
    const stamp = new Date().toISOString().slice(0, 10);
    if (input.format === 'XLSX') {
      const pass = new PassThrough();
      const chunks: Buffer[] = [];
      pass.on('data', (chunk: Buffer) => chunks.push(chunk));
      const done = new Promise<void>((resolve, reject) => {
        pass.on('end', () => resolve());
        pass.on('error', reject);
      });

      const { rowCount } = await this.reportData.streamExcelToWritable(input, pass);
      await done;

      return {
        buffer: Buffer.concat(chunks),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `omniops-${input.reportType}-${stamp}.xlsx`,
        rowCount,
      };
    }

    const { columns, rows, truncated } = await this.reportData.collectRowsForPdf(input);
    const buffer = await this.pdfRenderer.renderTabularReportPdf({
      title: `${input.reportType.replace('_', ' ').toUpperCase()} Report`,
      subtitle: `Scope: ${input.scope} | Active filters: ${JSON.stringify(input.filters ?? {})}`,
      columns,
      rows,
      note: truncated
        ? 'PDF tabular reports are capped at 1,000 rows for readability. Export as Excel (.xlsx) for the complete dataset.'
        : undefined,
    });

    return {
      buffer,
      contentType: 'application/pdf',
      filename: `omniops-${input.reportType}-${stamp}.pdf`,
      rowCount: rows.length,
    };
  }

  async enqueueAsyncExport(
    input: CreateExportInput,
    actor: AuthenticatedUser,
    ipAddress: string,
  ): Promise<ExportJobDto> {
    const jobRecord = await this.prisma.raw.$transaction(async (tx) => {
      const created = await tx.exportJob.create({
        data: {
          requestedBy: actor.id,
          reportType: input.reportType,
          format: input.format as ExportFormat,
          filters: {
            scope: input.scope,
            columns: input.columns ?? null,
            filters: input.filters ?? {},
          } as Prisma.InputJsonValue,
          status: ExportJobStatus.QUEUED,
        },
        include: { requester: { select: { fullName: true } } },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'EXPORT_JOB_QUEUED',
          entityType: 'ExportJob',
          entityId: created.id,
          afterState: {
            reportType: input.reportType,
            format: input.format,
            scope: input.scope,
          },
          ipAddress: ipAddress.slice(0, 64),
        },
      });

      return created;
    });

    await this.queue.add('generate-export', {
      jobId: jobRecord.id,
      userId: actor.id,
      input,
    });

    return this.toJobDto(jobRecord);
  }

  private async processQueuedExport(job: Job<ExportQueuePayload>): Promise<void> {
    const { jobId, userId, input } = job.data;

    await this.prisma.raw.exportJob.update({
      where: { id: jobId },
      data: { status: ExportJobStatus.PROCESSING, errorMessage: null },
    });

    try {
      const { buffer, contentType, rowCount } = await this.renderSyncReportBuffer(input);
      const ext = input.format === 'XLSX' ? 'xlsx' : 'pdf';
      const objectKey = `exports/${userId}/${jobId}.${ext}`;
      const expiresAt = new Date(Date.now() + this.linkTtlHours * 3_600_000);

      await this.storage.uploadBuffer(objectKey, buffer, contentType);

      await this.prisma.raw.$transaction([
        this.prisma.raw.exportJob.update({
          where: { id: jobId },
          data: {
            status: ExportJobStatus.COMPLETED,
            objectKey,
            rowCount,
            expiresAt,
            errorMessage: null,
          },
        }),
        this.prisma.raw.notification.create({
          data: {
            userId,
            type: NotificationType.EXPORT_READY,
            title: `${input.reportType.toUpperCase()} Export Ready (${input.format})`,
            message: `Processed ${rowCount.toLocaleString()} rows. Download available for ${this.linkTtlHours}h.`,
            metadata: { exportJobId: jobId, reportType: input.reportType, format: input.format },
          },
        }),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected export worker error';
      await this.prisma.raw.$transaction([
        this.prisma.raw.exportJob.update({
          where: { id: jobId },
          data: {
            status: ExportJobStatus.FAILED,
            errorMessage: msg.slice(0, 1000),
          },
        }),
        this.prisma.raw.notification.create({
          data: {
            userId,
            type: NotificationType.EXPORT_FAILED,
            title: `${input.reportType.toUpperCase()} Export Failed`,
            message: msg.slice(0, 400),
            metadata: { exportJobId: jobId },
          },
        }),
      ]);
      throw err;
    }
  }

  async listJobs(
    query: ExportJobsQuery,
    actor: AuthenticatedUser,
  ): Promise<OffsetPaginatedResponse<ExportJobDto>> {
    const where: Prisma.ExportJobWhereInput = {};
    // Non-admins only see their own export jobs
    if (actor.role !== 'ADMIN') {
      where.requestedBy = actor.id;
    }
    if (query.reportType) where.reportType = query.reportType;
    if (query.status) where.status = query.status as ExportJobStatus;

    const skip = (query.page - 1) * query.limit;
    const [total, rows] = await Promise.all([
      this.prisma.raw.exportJob.count({ where }),
      this.prisma.raw.exportJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: { requester: { select: { fullName: true } } },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    return {
      data: rows.map((r) => this.toJobDto(r)),
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

  async getDownloadStream(jobId: string, actor: AuthenticatedUser) {
    const job = await this.prisma.raw.exportJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Export job not found');

    // Enforce strict ownership unless Admin
    if (job.requestedBy !== actor.id && actor.role !== 'ADMIN') {
      throw new ForbiddenException('You do not have permission to download this export file.');
    }

    if (job.status !== ExportJobStatus.COMPLETED || !job.objectKey) {
      throw new BadRequestException(`Export job is not ready for download (status: ${job.status}).`);
    }

    if (job.expiresAt && job.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('Export file has expired and is no longer available.');
    }

    const { stream, contentType } = await this.storage.getObjectStream(job.objectKey);
    const ext = job.format === ExportFormat.XLSX ? 'xlsx' : 'pdf';
    return {
      stream,
      contentType,
      filename: `omniops-${job.reportType}-${job.id.slice(0, 8)}.${ext}`,
    };
  }

  async retryJob(jobId: string, actor: AuthenticatedUser): Promise<ExportJobDto> {
    const job = await this.prisma.raw.exportJob.findUnique({
      where: { id: jobId },
      include: { requester: { select: { fullName: true } } },
    });
    if (!job) throw new NotFoundException('Export job not found');

    if (job.requestedBy !== actor.id && actor.role !== 'ADMIN') {
      throw new ForbiddenException('You cannot retry another user export job.');
    }
    if (job.status !== ExportJobStatus.FAILED) {
      throw new BadRequestException('Only FAILED export jobs can be retried.');
    }

    const savedConfig = (job.filters as {
      scope?: 'current_page' | 'all_filtered';
      columns?: string[] | null;
      filters?: Record<string, unknown>;
    }) ?? {};

    const updated = await this.prisma.raw.exportJob.update({
      where: { id: job.id },
      data: { status: ExportJobStatus.QUEUED, errorMessage: null },
      include: { requester: { select: { fullName: true } } },
    });

    await this.queue.add('generate-export', {
      jobId: job.id,
      userId: job.requestedBy,
      input: {
        reportType: job.reportType as ExportReportType,
        format: job.format as SharedExportFormat,
        scope: savedConfig.scope ?? 'all_filtered',
        ...(savedConfig.columns ? { columns: savedConfig.columns } : {}),
        filters: savedConfig.filters ?? {},
        forceAsync: true,
      },
    });

    return this.toJobDto(updated);
  }

  /**
   * Deletes expired MinIO export artifacts & purges expired idempotency_keys.
   */
  async cleanupExpiredArtifacts(): Promise<{ deletedExports: number; deletedIdempotencyKeys: number }> {
    const expiredJobs = await this.prisma.raw.exportJob.findMany({
      where: {
        expiresAt: { lt: new Date() },
        objectKey: { not: null },
      },
      select: { id: true, objectKey: true },
    });

    let deletedExports = 0;
    for (const item of expiredJobs) {
      if (item.objectKey) {
        await this.storage.deleteObject(item.objectKey).catch(() => undefined);
      }
      await this.prisma.raw.exportJob.update({
        where: { id: item.id },
        data: { objectKey: null },
      });
      deletedExports++;
    }

    const idemRes = await this.prisma.raw.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (deletedExports > 0 || idemRes.count > 0) {
      this.logger.log(
        `Cleanup cron removed ${deletedExports} expired MinIO export(s) and ${idemRes.count} expired idempotency key(s).`,
      );
    }

    return { deletedExports, deletedIdempotencyKeys: idemRes.count };
  }
}
