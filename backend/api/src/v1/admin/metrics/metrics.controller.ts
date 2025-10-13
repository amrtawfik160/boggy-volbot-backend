import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AdminGuard } from '../../../guards/admin.guard'
import { MetricsService } from '../../../services/metrics.service'

@ApiTags('Admin Metrics')
@ApiBearerAuth('JWT-auth')
@Controller('admin/metrics')
@UseGuards(AdminGuard)
@Throttle({ default: { limit: 500, ttl: 60000 } }) // 500 requests per minute for admin
export class AdminMetricsController {
    constructor(private readonly metricsService: MetricsService) {}

    @Get('system')
    @ApiOperation({
        summary: 'Get system metrics',
        description: 'Retrieve system-wide metrics including API health, database health, Redis health, queue stats, and worker stats. Requires admin role.',
    })
    @ApiResponse({
        status: 200,
        description: 'System metrics retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                timestamp: { type: 'string', format: 'date-time' },
                api: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', enum: ['healthy', 'degraded', 'down'] },
                        uptime: { type: 'number' },
                        memory: { type: 'object' },
                        cpu: { type: 'object' },
                    },
                },
                database: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', enum: ['healthy', 'degraded', 'down'] },
                        responseTime: { type: 'number' },
                    },
                },
                redis: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', enum: ['healthy', 'degraded', 'down'] },
                        usedMemory: { type: 'string' },
                        connectedClients: { type: 'number' },
                    },
                },
                queues: { type: 'object' },
                workers: { type: 'object' },
            },
        },
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
    async getSystemMetrics() {
        return await this.metricsService.getSystemMetrics()
    }

    @Get('queues')
    @ApiOperation({
        summary: 'Get queue metrics',
        description: 'Retrieve detailed metrics for all BullMQ queues including job counts, processing times, and failure rates. Requires admin role.',
    })
    @ApiQuery({
        name: 'timeRange',
        required: false,
        enum: ['1h', '24h', '7d', '30d'],
        description: 'Time range for metrics (default: 24h)',
    })
    @ApiResponse({
        status: 200,
        description: 'Queue metrics retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                timestamp: { type: 'string', format: 'date-time' },
                timeRange: { type: 'string' },
                queues: {
                    type: 'object',
                    additionalProperties: {
                        type: 'object',
                        properties: {
                            waiting: { type: 'number' },
                            active: { type: 'number' },
                            completed: { type: 'number' },
                            failed: { type: 'number' },
                            delayed: { type: 'number' },
                            paused: { type: 'boolean' },
                            avgProcessingTime: { type: 'number' },
                            failureRate: { type: 'number' },
                        },
                    },
                },
            },
        },
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
    async getQueueMetrics(@Query('timeRange') timeRange?: string) {
        return await this.metricsService.getQueueMetrics(timeRange || '24h')
    }

    @Get('rpc')
    @ApiOperation({
        summary: 'Get RPC provider metrics',
        description: 'Retrieve health and performance metrics for all configured RPC providers. Requires admin role.',
    })
    @ApiResponse({
        status: 200,
        description: 'RPC metrics retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                timestamp: { type: 'string', format: 'date-time' },
                providers: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            url: { type: 'string' },
                            status: { type: 'string', enum: ['healthy', 'degraded', 'down'] },
                            latency: { type: 'number' },
                            successRate: { type: 'number' },
                            lastChecked: { type: 'string', format: 'date-time' },
                        },
                    },
                },
            },
        },
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
    async getRPCMetrics() {
        return await this.metricsService.getRPCMetrics()
    }
}
