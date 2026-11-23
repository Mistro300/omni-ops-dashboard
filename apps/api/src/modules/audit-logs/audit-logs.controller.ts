import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { auditLogsQuerySchema, PERMISSIONS, type AuditLogsQuery } from '@omni-ops/shared';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('Audit Logs (Admin)')
@ApiBearerAuth()
@RequirePermissions(PERMISSIONS.AUDIT_READ)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Cursor-paginated immutable audit log stream' })
  list(@Query(new ZodValidationPipe(auditLogsQuerySchema)) query: AuditLogsQuery) {
    return this.auditLogsService.list(query);
  }

  @Get('meta')
  @ApiOperation({ summary: 'Distinct actions, entity types, and actors for filter controls' })
  meta() {
    return this.auditLogsService.getFilterMetadata();
  }
}
