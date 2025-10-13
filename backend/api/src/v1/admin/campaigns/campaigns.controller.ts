import { Controller, Get, Post, Param, Query, Body, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common'
import { AdminGuard } from '../../../guards/admin.guard'
import { SupabaseService } from '../../../services/supabase.service'
import { Request } from 'express'

@Controller('v1/admin/campaigns')
@UseGuards(AdminGuard)
export class CampaignsController {
    constructor(private readonly supabaseService: SupabaseService) {}

    @Get()
    async getCampaigns(
        @Query('status') status?: string,
        @Query('userId') userId?: string,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20',
        @Query('sortBy') sortBy: string = 'created_at',
        @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc'
    ) {
        const pageNum = parseInt(page, 10)
        const limitNum = Math.min(parseInt(limit, 10), 100) // Max 100 items per page

        if (pageNum < 1 || limitNum < 1) {
            throw new HttpException('Invalid pagination parameters', HttpStatus.BAD_REQUEST)
        }

        const result = await this.supabaseService.getAdminCampaigns({
            status,
            userId,
            page: pageNum,
            limit: limitNum,
            sortBy,
            sortOrder,
        })

        // Calculate stats for each campaign
        const dataWithStats = await Promise.all(
            result.data.map(async campaign => {
                // Get runs for this campaign
                const runs = await this.supabaseService.getCampaignRunsByCampaignId(campaign.id)
                const activeRuns = runs.filter(r => r.status === 'active').length

                // Get basic job count
                const runIds = runs.map(r => r.id)
                const jobsData = await this.supabaseService.getClient()
                    .from('jobs')
                    .select('id, status', { count: 'exact' })
                    .in('run_id', runIds)

                const totalJobs = jobsData.count || 0
                const completedJobs = jobsData.data?.filter(j => j.status === 'completed').length || 0
                const successRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0

                return {
                    id: campaign.id,
                    user_id: campaign.user_id,
                    name: campaign.name,
                    token: {
                        id: campaign.tokens?.id,
                        symbol: campaign.tokens?.symbol,
                        mint: campaign.tokens?.mint,
                    },
                    pool: {
                        id: campaign.pools?.id,
                        pool_address: campaign.pools?.pool_address,
                        dex: campaign.pools?.dex,
                    },
                    status: campaign.status,
                    params: campaign.params,
                    created_at: campaign.created_at,
                    updated_at: campaign.updated_at,
                    user: {
                        id: campaign.users?.id,
                        email: campaign.users?.email,
                    },
                    stats: {
                        totalRuns: runs.length,
                        activeRuns,
                        totalJobs,
                        successRate,
                    },
                }
            })
        )

        const totalPages = Math.ceil(result.total / limitNum)

        return {
            data: dataWithStats,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: result.total,
                totalPages,
            },
        }
    }

    @Get(':id')
    async getCampaignById(@Param('id') id: string) {
        const campaign = await this.supabaseService.getAdminCampaignById(id)

        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        const stats = await this.supabaseService.getAdminCampaignStats(id)

        return {
            id: campaign.id,
            user_id: campaign.user_id,
            name: campaign.name,
            token_id: campaign.token_id,
            pool_id: campaign.pool_id,
            params: campaign.params,
            status: campaign.status,
            created_at: campaign.created_at,
            updated_at: campaign.updated_at,
            user: {
                id: campaign.users?.id,
                email: campaign.users?.email,
                role: campaign.users?.role,
            },
            token: {
                id: campaign.tokens?.id,
                mint: campaign.tokens?.mint,
                symbol: campaign.tokens?.symbol,
                decimals: campaign.tokens?.decimals,
            },
            pool: {
                id: campaign.pools?.id,
                pool_address: campaign.pools?.pool_address,
                dex: campaign.pools?.dex,
            },
            runs: campaign.campaign_runs || [],
            stats,
        }
    }

    @Post(':id/override')
    async overrideCampaign(
        @Param('id') id: string,
        @Body() body: { action: 'force_pause' | 'force_stop' | 'force_resume' | 'reset'; reason: string; notifyUser?: boolean },
        @Req() request: Request
    ) {
        if (!body.action || !body.reason) {
            throw new HttpException('Action and reason are required', HttpStatus.BAD_REQUEST)
        }

        const campaign = await this.supabaseService.getAdminCampaignById(id)
        if (!campaign) {
            throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
        }

        // Map action to status
        let newStatus: string
        switch (body.action) {
            case 'force_pause':
                newStatus = 'paused'
                break
            case 'force_stop':
                newStatus = 'stopped'
                break
            case 'force_resume':
                newStatus = 'active'
                break
            case 'reset':
                newStatus = 'draft'
                break
            default:
                throw new HttpException('Invalid action', HttpStatus.BAD_REQUEST)
        }

        // Update campaign status
        const updatedCampaign = await this.supabaseService.updateCampaignStatus(id, newStatus)

        // Create audit log
        const user = (request as any).user
        const auditLog = await this.supabaseService.createAuditLog({
            admin_id: user?.id,
            user_id: campaign.user_id,
            action: `campaign_${body.action}`,
            entity: 'campaign',
            entity_id: id,
            metadata: {
                action: body.action,
                reason: body.reason,
                oldStatus: campaign.status,
                newStatus,
                notifyUser: body.notifyUser,
            },
            ip_address: request.ip,
            user_agent: request.headers['user-agent'],
        })

        return {
            success: true,
            campaign: {
                id: updatedCampaign.id,
                status: updatedCampaign.status,
                updated_at: updatedCampaign.updated_at,
            },
            audit: {
                id: auditLog.id,
                action: auditLog.action,
                reason: body.reason,
                timestamp: auditLog.created_at,
            },
        }
    }
}
