import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { SupabaseService } from './supabase.service'

export type OverrideAction = 'force_pause' | 'force_stop' | 'force_resume' | 'reset'

interface CampaignOverrideResult {
    success: boolean
    campaign: {
        id: string
        status: string
        updated_at: string
    }
    audit: {
        id: string
        action: string
        reason: string
        timestamp: string
    }
}

@Injectable()
export class OverrideService {
    private readonly logger = new Logger(OverrideService.name)

    constructor(private readonly supabase: SupabaseService) {}

    /**
     * Execute manual override action on a campaign
     */
    async overrideCampaign(
        campaignId: string,
        adminId: string,
        action: OverrideAction,
        reason: string,
        notifyUser?: boolean,
        ipAddress?: string,
        userAgent?: string
    ): Promise<CampaignOverrideResult> {
        this.logger.warn(`Campaign override initiated by admin ${adminId}: ${action} on campaign ${campaignId}`)

        // Validate action
        const validActions: OverrideAction[] = ['force_pause', 'force_stop', 'force_resume', 'reset']
        if (!validActions.includes(action)) {
            throw new BadRequestException(`Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`)
        }

        // Get campaign to verify it exists
        const campaign = await this.supabase.getAdminCampaignById(campaignId)
        if (!campaign) {
            throw new NotFoundException(`Campaign ${campaignId} not found`)
        }

        // Determine new status based on action
        const statusMap: Record<OverrideAction, string> = {
            force_pause: 'paused',
            force_stop: 'stopped',
            force_resume: 'active',
            reset: 'draft',
        }

        const newStatus = statusMap[action]
        const oldStatus = campaign.status

        // Update campaign status
        const updatedCampaign = await this.supabase.updateCampaignStatus(campaignId, newStatus)

        // Create audit log
        const auditLog = await this.supabase.createAuditLog({
            admin_id: adminId,
            user_id: campaign.user_id,
            action: `campaign.override.${action}`,
            entity: 'campaign',
            entity_id: campaignId,
            metadata: {
                action,
                reason,
                oldStatus,
                newStatus,
                notifyUser: notifyUser ?? false,
            },
            ip_address: ipAddress,
            user_agent: userAgent,
        })

        // TODO: Implement user notification if notifyUser is true
        if (notifyUser) {
            this.logger.log(`User notification requested for campaign ${campaignId} override`)
            // Implementation would depend on notification system (email, in-app, etc.)
        }

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
                reason,
                timestamp: auditLog.created_at,
            },
        }
    }

    /**
     * Validate override action against current campaign state
     */
    validateOverrideAction(currentStatus: string, action: OverrideAction): { valid: boolean; message?: string } {
        // Define valid state transitions
        const validTransitions: Record<OverrideAction, string[]> = {
            force_pause: ['active', 'paused'], // Can pause active or already paused
            force_stop: ['active', 'paused', 'stopped'], // Can stop active, paused, or already stopped
            force_resume: ['paused', 'stopped', 'active'], // Can resume paused, stopped, or already active
            reset: ['draft', 'active', 'paused', 'stopped', 'completed'], // Can reset from any state
        }

        const allowedStates = validTransitions[action]
        if (!allowedStates) {
            return { valid: false, message: `Unknown action: ${action}` }
        }

        if (!allowedStates.includes(currentStatus)) {
            return {
                valid: false,
                message: `Cannot ${action} campaign with status ${currentStatus}. Allowed statuses: ${allowedStates.join(', ')}`,
            }
        }

        return { valid: true }
    }

    /**
     * Get override history for a campaign
     */
    async getCampaignOverrideHistory(campaignId: string, limit: number = 50): Promise<any[]> {
        const { data, error } = await this.supabase.getClient()
            .from('audit_logs')
            .select('*')
            .eq('entity', 'campaign')
            .eq('entity_id', campaignId)
            .like('action', 'campaign.override.%')
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error) {
            this.logger.error(`Failed to fetch override history for campaign ${campaignId}:`, error)
            throw error
        }

        return data || []
    }

    /**
     * Get all recent override actions across all campaigns
     */
    async getRecentOverrides(limit: number = 100): Promise<any[]> {
        const { data, error } = await this.supabase.getClient()
            .from('audit_logs')
            .select('*')
            .eq('entity', 'campaign')
            .like('action', 'campaign.override.%')
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error) {
            this.logger.error('Failed to fetch recent overrides:', error)
            throw error
        }

        return data || []
    }
}
