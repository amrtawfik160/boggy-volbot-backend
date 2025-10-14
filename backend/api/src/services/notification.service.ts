/**
 * Notification Service
 * Main service for dispatching notifications and logging
 */

import { Injectable } from '@nestjs/common'
import { SupabaseService } from './supabase.service'
import { EmailService } from './email.service'
import { NotificationTemplateService } from './notification-template.service'
import { NotificationPreferencesService } from './notification-preferences.service'
import { createLogger } from '../config/logger'
import { getEnvironmentConfig } from '../config/environment'
import {
    NotificationEventType,
    NotificationStatus,
    SendNotificationDto,
    NotificationLog,
} from '../types/notifications'

const logger = createLogger({ name: 'notification-service' })

@Injectable()
export class NotificationService {
    private appBaseUrl: string

    constructor(
        private readonly supabase: SupabaseService,
        private readonly emailService: EmailService,
        private readonly templateService: NotificationTemplateService,
        private readonly preferencesService: NotificationPreferencesService,
    ) {
        const config = getEnvironmentConfig()
        this.appBaseUrl = config.appBaseUrl || 'http://localhost:3000'
    }

    /**
     * Send a notification to a user
     */
    async sendNotification(dto: SendNotificationDto): Promise<NotificationLog> {
        const { eventType, userId, recipientEmail, variables, metadata } = dto

        logger.info({ eventType, userId, recipientEmail }, 'Sending notification')

        // Check if user wants to receive this notification
        const shouldNotify = await this.preferencesService.shouldNotify(userId, eventType)
        if (!shouldNotify) {
            logger.info({ eventType, userId }, 'User has disabled this notification type')
            // Still log it but mark as skipped in metadata
            return this.logNotification({
                userId,
                eventType,
                recipientEmail,
                subject: '',
                status: NotificationStatus.SENT,
                provider: this.emailService.getProvider(),
                metadata: { ...metadata, skipped: true, reason: 'User preference disabled' },
            })
        }

        try {
            // Get the template
            const template = await this.templateService.findByEventType(eventType)

            // Render the template with variables
            const subject = this.templateService.renderTemplate(template.subject, variables)
            const htmlBody = this.templateService.renderTemplate(template.html_body, variables)
            const textBody = this.templateService.renderTemplate(template.text_body, variables)

            // Send the email
            const result = await this.emailService.sendEmail({
                to: recipientEmail,
                subject,
                html: htmlBody,
                text: textBody,
            })

            // Log the notification
            const notificationLog = await this.logNotification({
                userId,
                templateId: template.id,
                eventType,
                recipientEmail,
                subject,
                status: result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
                provider: this.emailService.getProvider(),
                providerMessageId: result.messageId,
                errorMessage: result.error,
                metadata,
                sentAt: result.success ? new Date().toISOString() : undefined,
            })

            if (result.success) {
                logger.info({ eventType, userId, messageId: result.messageId }, 'Notification sent successfully')
            } else {
                logger.error({ eventType, userId, error: result.error }, 'Failed to send notification')
            }

            return notificationLog
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            logger.error({ error: errorMessage, eventType, userId }, 'Exception while sending notification')

            // Log the failed notification
            return this.logNotification({
                userId,
                eventType,
                recipientEmail,
                subject: '',
                status: NotificationStatus.FAILED,
                provider: this.emailService.getProvider(),
                errorMessage,
                metadata,
            })
        }
    }

    /**
     * Send campaign started notification
     */
    async notifyCampaignStarted(params: {
        userId: string
        userEmail: string
        campaignId: string
        campaignName: string
        tokenSymbol: string
    }): Promise<void> {
        await this.sendNotification({
            eventType: NotificationEventType.CAMPAIGN_STARTED,
            userId: params.userId,
            recipientEmail: params.userEmail,
            variables: {
                campaignName: params.campaignName,
                tokenSymbol: params.tokenSymbol,
                startedAt: new Date().toLocaleString(),
                dashboardUrl: `${this.appBaseUrl}/dashboard/campaigns/${params.campaignId}`,
            },
            metadata: {
                campaignId: params.campaignId,
            },
        })
    }

    /**
     * Send campaign completed notification
     */
    async notifyCampaignCompleted(params: {
        userId: string
        userEmail: string
        campaignId: string
        campaignName: string
        totalTransactions: number
        totalVolume: number
        duration: string
    }): Promise<void> {
        await this.sendNotification({
            eventType: NotificationEventType.CAMPAIGN_COMPLETED,
            userId: params.userId,
            recipientEmail: params.userEmail,
            variables: {
                campaignName: params.campaignName,
                totalTransactions: params.totalTransactions.toString(),
                totalVolume: params.totalVolume.toFixed(2),
                duration: params.duration,
                dashboardUrl: `${this.appBaseUrl}/dashboard/campaigns/${params.campaignId}`,
            },
            metadata: {
                campaignId: params.campaignId,
                totalTransactions: params.totalTransactions,
                totalVolume: params.totalVolume,
            },
        })
    }

    /**
     * Send campaign failed notification
     */
    async notifyCampaignFailed(params: {
        userId: string
        userEmail: string
        campaignId: string
        campaignName: string
        errorMessage: string
    }): Promise<void> {
        await this.sendNotification({
            eventType: NotificationEventType.CAMPAIGN_FAILED,
            userId: params.userId,
            recipientEmail: params.userEmail,
            variables: {
                campaignName: params.campaignName,
                errorMessage: params.errorMessage,
                dashboardUrl: `${this.appBaseUrl}/dashboard/campaigns/${params.campaignId}`,
            },
            metadata: {
                campaignId: params.campaignId,
                error: params.errorMessage,
            },
        })
    }

    /**
     * Send campaign paused notification
     */
    async notifyCampaignPaused(params: {
        userId: string
        userEmail: string
        campaignId: string
        campaignName: string
    }): Promise<void> {
        await this.sendNotification({
            eventType: NotificationEventType.CAMPAIGN_PAUSED,
            userId: params.userId,
            recipientEmail: params.userEmail,
            variables: {
                campaignName: params.campaignName,
                dashboardUrl: `${this.appBaseUrl}/dashboard/campaigns/${params.campaignId}`,
            },
            metadata: {
                campaignId: params.campaignId,
            },
        })
    }

    /**
     * Send low wallet balance notification
     */
    async notifyLowWalletBalance(params: {
        userId: string
        userEmail: string
        walletId: string
        walletLabel: string
        currentBalance: number
    }): Promise<void> {
        await this.sendNotification({
            eventType: NotificationEventType.LOW_WALLET_BALANCE,
            userId: params.userId,
            recipientEmail: params.userEmail,
            variables: {
                walletLabel: params.walletLabel,
                currentBalance: params.currentBalance.toFixed(4),
                walletsUrl: `${this.appBaseUrl}/dashboard/wallets`,
            },
            metadata: {
                walletId: params.walletId,
                currentBalance: params.currentBalance,
            },
        })
    }

    /**
     * Send maintenance scheduled notification
     */
    async notifyMaintenanceScheduled(params: {
        userId: string
        userEmail: string
        maintenanceDate: string
        duration: string
        impact: string
    }): Promise<void> {
        await this.sendNotification({
            eventType: NotificationEventType.MAINTENANCE_SCHEDULED,
            userId: params.userId,
            recipientEmail: params.userEmail,
            variables: {
                maintenanceDate: params.maintenanceDate,
                duration: params.duration,
                impact: params.impact,
            },
            metadata: {
                maintenanceDate: params.maintenanceDate,
                duration: params.duration,
            },
        })
    }

    /**
     * Send maintenance completed notification
     */
    async notifyMaintenanceCompleted(params: { userId: string; userEmail: string }): Promise<void> {
        await this.sendNotification({
            eventType: NotificationEventType.MAINTENANCE_COMPLETED,
            userId: params.userId,
            recipientEmail: params.userEmail,
            variables: {},
            metadata: {},
        })
    }

    /**
     * Send system alert notification
     */
    async notifySystemAlert(params: {
        userId: string
        userEmail: string
        alertTitle: string
        alertMessage: string
    }): Promise<void> {
        await this.sendNotification({
            eventType: NotificationEventType.SYSTEM_ALERT,
            userId: params.userId,
            recipientEmail: params.userEmail,
            variables: {
                alertTitle: params.alertTitle,
                alertMessage: params.alertMessage,
            },
            metadata: {
                alertTitle: params.alertTitle,
            },
        })
    }

    /**
     * Send batch notifications to multiple users
     */
    async sendBatchNotifications(notifications: SendNotificationDto[]): Promise<NotificationLog[]> {
        const results = await Promise.allSettled(notifications.map((dto) => this.sendNotification(dto)))

        return results.map((result) => {
            if (result.status === 'fulfilled') {
                return result.value
            }
            // Log failed batch item
            logger.error({ error: result.reason }, 'Failed to send batch notification')
            throw result.reason
        })
    }

    /**
     * Get notification logs for a user
     */
    async getNotificationLogs(userId: string, limit = 50): Promise<NotificationLog[]> {
        const client = this.supabase.getClient()
        const { data, error } = await client
            .from('notification_logs')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit)

        if (error) {
            logger.error({ error: error.message, userId }, 'Failed to fetch notification logs')
            throw new Error(`Failed to fetch notification logs: ${error.message}`)
        }

        return data as NotificationLog[]
    }

    /**
     * Log a notification to the database
     */
    private async logNotification(data: {
        userId: string
        templateId?: string
        eventType: NotificationEventType
        recipientEmail: string
        subject: string
        status: NotificationStatus
        provider: string
        providerMessageId?: string
        errorMessage?: string
        metadata?: Record<string, any>
        sentAt?: string
    }): Promise<NotificationLog> {
        const client = this.supabase.getClient()
        const { data: log, error } = await client
            .from('notification_logs')
            .insert({
                user_id: data.userId,
                template_id: data.templateId,
                event_type: data.eventType,
                recipient_email: data.recipientEmail,
                subject: data.subject,
                status: data.status,
                provider: data.provider,
                provider_message_id: data.providerMessageId,
                error_message: data.errorMessage,
                metadata: data.metadata,
                sent_at: data.sentAt,
            })
            .select()
            .single()

        if (error) {
            logger.error({ error: error.message }, 'Failed to log notification')
            throw new Error(`Failed to log notification: ${error.message}`)
        }

        return log as NotificationLog
    }
}
