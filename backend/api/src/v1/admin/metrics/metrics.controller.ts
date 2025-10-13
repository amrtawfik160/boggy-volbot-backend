import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AdminGuard } from '../../../guards/admin.guard'
import { MetricsService } from '../../../services/metrics.service'

@Controller('admin/metrics')
@UseGuards(AdminGuard)
@Throttle({ default: { limit: 500, ttl: 60000 } }) // 500 requests per minute for admin
export class AdminMetricsController {
    constructor(private readonly metricsService: MetricsService) {}

    @Get('system')
    async getSystemMetrics() {
        return await this.metricsService.getSystemMetrics()
    }

    @Get('queues')
    async getQueueMetrics(@Query('timeRange') timeRange?: string) {
        return await this.metricsService.getQueueMetrics(timeRange || '24h')
    }

    @Get('rpc')
    async getRPCMetrics() {
        return await this.metricsService.getRPCMetrics()
    }
}
