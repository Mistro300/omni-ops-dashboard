import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PdfRendererService } from './pdf-renderer.service';
import { ReportDataService } from './report-data.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { StorageService } from './storage.service';

@Module({
  imports: [OrdersModule],
  controllers: [ReportsController],
  providers: [StorageService, PdfRendererService, ReportDataService, ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
