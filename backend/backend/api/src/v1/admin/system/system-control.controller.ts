import { Controller, Post, Get, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger'
import { AdminGuard } from '../../../guards/admin.guard'
import { SystemControlService } from '../../../services/system-control.service'
import { SupabaseService } from '../../../services/supabase.service'

class SystemPauseDto {
    reason!: string
    notifyUsers?: boolean
}

@ApiTags('Admin System')
@ApiBearerAuth('JWT-auth')
@Controller('v1/admin/system')
@UseGuards(AdminGuard)
export class SystemControlController {
    constructor(
        private readonly systemControl: SystemControlService,
        private readonly supabase: SupabaseService
    ) {}

    /**
     * POST /v1/admin/system/pause
     * Emergency pause all campaign execution
     */
    @Post('pause')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Emergency pause system',
        description: 'Immediately pause all system operations including all BullMQ queues. All actions are logged to audit trail. Requires admin role.',
    })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['reason'],
            properties: {
                reason: { type: 'string', description: 'Reason for system pause (required for audit trail)' },
                notifyUsers: { type: 'boolean', description: 'Whether to notify all users about system pause (optional)' },
            },
        },
    })
    @ApiResponse({ status: 200, description: 'System paused successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
    async pauseSystem(@Body() dto: SystemPauseDto, @Request() req: any) {
        const adminId = req.user.id
        const ipAddress = req.ip
        const userAgent = req.headers['user-agent']

        const result = await this.systemControl.pauseSystem(adminId, dto.reason)

        // Create audit log
        await this.supabase.createAuditLog({
            admin_id: adminId,
            action: 'system.pause',
            entity: 'system',
            metadata: {
                reason: dto.reason,
                notifyUsers: dto.notifyUsers ?? false,
                queues: result.queues,
            },
            ip_address: ipAddress,
            user_agent: userAgent,
        })

        // TODO: Implement user notifications if notifyUsers is true
        if (dto.notifyUsers) {
            // Send notifications to all users about system pause
        }

        return result
    }

    /**
     * POST /v1/admin/system/resume
     * Resume all system operations
     */
    @Post('resume')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Resume system operations',
        description: 'Resume all system operations and unpause all BullMQ queues. All actions are logged to audit trail. Requires admin role.',
    })
    @ApiResponse({ status: 200, description: 'System resumed successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
    async resumeSystem(@Request() req: any) {
        const adminId = req.user.id
        const ipAddress = req.ip
        const userAgent = req.headers['user-agent']

        const result = await this.systemControl.resumeSystem(adminId)

        // Create audit log
        await this.supabase.createAuditLog({
            admin_id: adminId,
            action: 'system.resume',
            entity: 'system',
            metadata: {
                queues: result.queues,
            },
            ip_address: ipAddress,
            user_agent: userAgent,
        })

        return result
    }

    /**
     * GET /v1/admin/system/health
     * Comprehensive health check of all system components
     */
    @Get('health')
    @ApiOperation({
        summary: 'Get system health',
        description: 'Retrieve comprehensive health status of all system components including API, database, Redis, queues, RPC providers, and workers. Requires admin role.',
    })
    @ApiResponse({
        status: 200,
        description: 'System health retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                status: { type: 'string', enum: ['healthy', 'degraded', 'down'] },
                timestamp: { type: 'string', format: 'date-time' },
                components: {
                    type: 'object',
                    properties: {
                        api: { type: 'object' },
                        database: { type: 'object' },
                        redis: { type: 'object' },
                        queues: { type: 'object' },
                        rpc: { type: 'object' },
                        workers: { type: 'object' },
                    },
                },
            },
        },
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
    async getSystemHealth() {
        return this.systemControl.getSystemHealth()
    }

    /**
     * GET /v1/admin/system/status
     * Get current system pause state
     */
    @Get('status')
    @ApiOperation({
        summary: 'Get system status',
        description: 'Get current system pause state and overall health status. Requires admin role.',
    })
    @ApiResponse({
        status: 200,
        description: 'System status retrieved successfully',
        schema: {
            type: 'object',
            properties: {
                paused: { type: 'boolean' },
                timestamp: { type: 'string', format: 'date-time' },
                pauseState: {
                    type: 'object',
                    properties: {
                        paused: { type: 'boolean' },
                        admin_id: { type: 'string' },
                        reason: { type: 'string' },
                        timestamp: { type: 'string', format: 'date-time' },
                    },
                },
                health: { type: 'string', enum: ['healthy', 'degraded', 'down'] },
            },
        },
    })
    @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
    @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
    async getSystemStatus() {
        const pauseState = await this.systemControl.getPauseState()
        const isHealthy = await this.systemControl.getSystemHealth()

        return {
            paused: pauseState?.paused ?? false,
            timestamp: new Date().toISOString(),
            pauseState,
            health: isHealthy.status,
        }
    }
}
