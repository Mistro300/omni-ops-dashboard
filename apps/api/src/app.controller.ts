import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ROLES } from '@omni-ops/shared';
import { Public } from './common/decorators/auth.decorators';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Service liveness & database connectivity check' })
  async getHealth() {
    let database: 'connected' | 'disconnected' = 'disconnected';
    let stats: {
      users: number;
      warehouses: number;
      products: number;
      orders: number;
      stockMovements: number;
    } | null = null;

    try {
      await this.prisma.raw.$queryRaw`SELECT 1`;
      database = 'connected';
      const [users, warehouses, products, orders, stockMovements] = await Promise.all([
        this.prisma.db.user.count(),
        this.prisma.db.warehouse.count(),
        this.prisma.db.product.count(),
        this.prisma.db.order.count(),
        this.prisma.db.stockMovement.count(),
      ]);
      stats = { users, warehouses, products, orders, stockMovements };
    } catch {
      database = 'disconnected';
    }

    return {
      status: database === 'connected' ? 'ok' : 'degraded',
      service: 'omniops-api',
      database,
      rolesSupported: Object.values(ROLES),
      stats,
      timestamp: new Date().toISOString(),
    };
  }
}
