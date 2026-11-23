import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { analyticsQuerySchema, PERMISSIONS, type AnalyticsQuery } from '@omni-ops/shared';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics & KPIs')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @RequirePermissions(PERMISSIONS.ANALYTICS_READ)
  @Get('overview')
  @ApiOperation({
    summary: 'Aggregated KPIs, period-over-period trends, and 5 chart series (Redis cached)',
  })
  getOverview(@Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery) {
    return this.analyticsService.getOverview(query);
  }
}
