import { Controller, Post, Get, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common'
import { AdminGuard } from '../../../guards/admin.guard'
import { SystemControlService } from '../../../services/system-control.service'
import { SupabaseService } from '../../../services/supabase.service'

class SystemPauseDto {
    reason!: string
    notifyUsers?: boolean
}

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
    async getSystemHealth() {
        return this.systemControl.getSystemHealth()
    }

    /**
     * GET /v1/admin/system/status
     * Get current system pause state
     */
    @Get('status')
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
