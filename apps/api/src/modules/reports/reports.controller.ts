import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createExportSchema,
  exportJobsQuerySchema,
  PERMISSIONS,
  type CreateExportInput,
  type ExportJobsQuery,
} from '@omni-ops/shared';
import type { Request, Response } from 'express';
import {
  AuthenticatedUser,
  CurrentUser,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReportsService } from './reports.service';

@ApiTags('Reports & Exports (Excel / PDF)')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  private getIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    return typeof fwd === 'string'
      ? fwd.split(',')[0]?.trim() || req.ip || '127.0.0.1'
      : req.ip || '127.0.0.1';
  }

  @RequirePermissions(PERMISSIONS.ORDERS_READ, PERMISSIONS.REPORTS_EXPORT)
  @Get('orders/:id/invoice.pdf')
  @ApiOperation({ summary: 'Generate and stream a PDF Invoice for a single order via Playwright' })
  async downloadOrderInvoice(@Param('id') id: string, @Res() res: Response) {
    const { filename, buffer } = await this.reportsService.generateOrderInvoicePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.status(HttpStatus.OK).send(buffer);
  }

  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @Post('export')
  @ApiOperation({
    summary:
      'Hybrid Sync/Async Export: streams directly <=5,000 rows, or enqueues BullMQ + MinIO job >5,000 rows',
  })
  async exportReport(
    @Body(new ZodValidationPipe(createExportSchema)) dto: CreateExportInput,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { isAsync, estimatedRows } = await this.reportsService.shouldRunAsync(dto);

    if (isAsync) {
      const job = await this.reportsService.enqueueAsyncExport(dto, user, this.getIp(req));
      res.setHeader('X-Export-Mode', 'async');
      return res.status(HttpStatus.ACCEPTED).json({
        mode: 'async',
        estimatedRows,
        job,
      });
    }

    const { buffer, contentType, filename, rowCount } =
      await this.reportsService.renderSyncReportBuffer(dto);
    res.setHeader('X-Export-Mode', 'sync');
    res.setHeader('X-Export-Row-Count', String(rowCount));
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    return res.status(HttpStatus.OK).send(buffer);
  }

  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @Get('jobs')
  @ApiOperation({ summary: 'List export jobs (Admin sees all; Editor/Viewer see own jobs)' })
  listJobs(
    @Query(new ZodValidationPipe(exportJobsQuerySchema)) query: ExportJobsQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.listJobs(query, user);
  }

  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @Get('jobs/:id/download')
  @ApiOperation({ summary: 'Protected download endpoint verifying ownership, RBAC & expiry via MinIO' })
  async downloadJob(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { stream, contentType, filename } = await this.reportsService.getDownloadStream(id, user);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    stream.pipe(res);
  }

  @RequirePermissions(PERMISSIONS.REPORTS_EXPORT)
  @Post('jobs/:id/retry')
  @ApiOperation({ summary: 'Retry a failed background export job' })
  retryJob(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.retryJob(id, user);
  }
}
