/**
 * NotificationService Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NotificationService } from './notification.service'
import { SupabaseService } from './supabase.service'
import { EmailService } from './email.service'
import { NotificationTemplateService } from './notification-template.service'
import { NotificationPreferencesService } from './notification-preferences.service'
import { NotificationEventType, NotificationStatus } from '../types/notifications'

// Mock dependencies
const mockSupabaseService = {
    getClient: vi.fn(),
}

const mockEmailService = {
    sendEmail: vi.fn(),
    getProvider: vi.fn().mockReturnValue('resend'),
}

const mockTemplateService = {
    findByEventType: vi.fn(),
    renderTemplate: vi.fn(),
}

const mockPreferencesService = {
    shouldNotify: vi.fn(),
}

// Mock environment config
vi.mock('../config/environment', () => ({
    getEnvironmentConfig: vi.fn(() => ({
        appBaseUrl: 'http://localhost:3000',
    })),
}))

// Mock logger
vi.mock('../config/logger', () => ({
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    })),
}))

describe('NotificationService', () => {
    let service: NotificationService
    let mockClient: any

    beforeEach(() => {
        mockClient = {
            from: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
        }

        mockSupabaseService.getClient.mockReturnValue(mockClient)

        service = new NotificationService(
            mockSupabaseService as any,
            mockEmailService as any,
            mockTemplateService as any,
            mockPreferencesService as any,
        )

        // Reset mocks
        vi.clearAllMocks()
    })

    describe('sendNotification', () => {
        it('should send notification successfully', async () => {
            const mockTemplate = {
                id: 'template-1',
                event_type: NotificationEventType.CAMPAIGN_STARTED,
                subject: 'Campaign {{name}} Started',
                html_body: '<p>Campaign {{name}} started</p>',
                text_body: 'Campaign {{name}} started',
            }

            mockPreferencesService.shouldNotify.mockResolvedValue(true)
            mockTemplateService.findByEventType.mockResolvedValue(mockTemplate)
            mockTemplateService.renderTemplate.mockImplementation((template, vars) => {
                return template.replace('{{name}}', vars.name)
            })
            mockEmailService.sendEmail.mockResolvedValue({
                success: true,
                messageId: 'msg-123',
            })
            mockClient.single.mockResolvedValue({
                data: {
                    id: 'log-1',
                    status: NotificationStatus.SENT,
                },
                error: null,
            })

            const result = await service.sendNotification({
                eventType: NotificationEventType.CAMPAIGN_STARTED,
                userId: 'user-1',
                recipientEmail: 'user@example.com',
                variables: { name: 'Test Campaign' },
                metadata: { campaignId: 'campaign-1' },
            })

            expect(result).toHaveProperty('id')
            expect(mockPreferencesService.shouldNotify).toHaveBeenCalledWith('user-1', NotificationEventType.CAMPAIGN_STARTED)
            expect(mockTemplateService.findByEventType).toHaveBeenCalledWith(NotificationEventType.CAMPAIGN_STARTED)
            expect(mockEmailService.sendEmail).toHaveBeenCalled()
        })

        it('should skip notification if user has disabled it', async () => {
            mockPreferencesService.shouldNotify.mockResolvedValue(false)
            mockClient.single.mockResolvedValue({
                data: { id: 'log-1', status: NotificationStatus.SENT },
                error: null,
            })

            const result = await service.sendNotification({
                eventType: NotificationEventType.CAMPAIGN_STARTED,
                userId: 'user-1',
                recipientEmail: 'user@example.com',
                variables: {},
                metadata: {},
            })

            expect(result).toHaveProperty('id')
            expect(mockEmailService.sendEmail).not.toHaveBeenCalled()
        })

        it('should log failed notifications', async () => {
            mockPreferencesService.shouldNotify.mockResolvedValue(true)
            mockTemplateService.findByEventType.mockResolvedValue({
                id: 'template-1',
                event_type: NotificationEventType.CAMPAIGN_STARTED,
                subject: 'Test',
                html_body: '<p>Test</p>',
                text_body: 'Test',
            })
            mockTemplateService.renderTemplate.mockReturnValue('Rendered')
            mockEmailService.sendEmail.mockResolvedValue({
                success: false,
                error: 'Email delivery failed',
            })
            mockClient.single.mockResolvedValue({
                data: {
                    id: 'log-1',
                    status: NotificationStatus.FAILED,
                    error_message: 'Email delivery failed',
                },
                error: null,
            })

            const result = await service.sendNotification({
                eventType: NotificationEventType.CAMPAIGN_STARTED,
                userId: 'user-1',
                recipientEmail: 'user@example.com',
                variables: {},
                metadata: {},
            })

            expect(result.status).toBe(NotificationStatus.FAILED)
            expect(result.error_message).toBe('Email delivery failed')
        })

        it('should handle exceptions during notification', async () => {
            mockPreferencesService.shouldNotify.mockResolvedValue(true)
            mockTemplateService.findByEventType.mockRejectedValue(new Error('Template not found'))
            mockClient.single.mockResolvedValue({
                data: {
                    id: 'log-1',
                    status: NotificationStatus.FAILED,
                },
                error: null,
            })

            const result = await service.sendNotification({
                eventType: NotificationEventType.CAMPAIGN_STARTED,
                userId: 'user-1',
                recipientEmail: 'user@example.com',
                variables: {},
                metadata: {},
            })

            expect(result.status).toBe(NotificationStatus.FAILED)
        })
    })

    describe('notifyCampaignStarted', () => {
        it('should send campaign started notification', async () => {
            const sendNotificationSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue({
                id: 'log-1',
                user_id: 'user-1',
                event_type: NotificationEventType.CAMPAIGN_STARTED,
                status: NotificationStatus.SENT,
            } as any)

            await service.notifyCampaignStarted({
                userId: 'user-1',
                userEmail: 'user@example.com',
                campaignId: 'campaign-1',
                campaignName: 'Test Campaign',
                tokenSymbol: 'TEST',
            })

            expect(sendNotificationSpy).toHaveBeenCalledWith({
                eventType: NotificationEventType.CAMPAIGN_STARTED,
                userId: 'user-1',
                recipientEmail: 'user@example.com',
                variables: expect.objectContaining({
                    campaignName: 'Test Campaign',
                    tokenSymbol: 'TEST',
                }),
                metadata: expect.objectContaining({
                    campaignId: 'campaign-1',
                }),
            })
        })
    })

    describe('notifyCampaignCompleted', () => {
        it('should send campaign completed notification', async () => {
            const sendNotificationSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue({
                id: 'log-1',
                user_id: 'user-1',
                event_type: NotificationEventType.CAMPAIGN_COMPLETED,
                status: NotificationStatus.SENT,
            } as any)

            await service.notifyCampaignCompleted({
                userId: 'user-1',
                userEmail: 'user@example.com',
                campaignId: 'campaign-1',
                campaignName: 'Test Campaign',
                totalTransactions: 100,
                totalVolume: 1000.5,
                duration: '2 hours',
            })

            expect(sendNotificationSpy).toHaveBeenCalledWith({
                eventType: NotificationEventType.CAMPAIGN_COMPLETED,
                userId: 'user-1',
                recipientEmail: 'user@example.com',
                variables: expect.objectContaining({
                    campaignName: 'Test Campaign',
                    totalTransactions: '100',
                    totalVolume: '1000.50',
                    duration: '2 hours',
                }),
                metadata: expect.objectContaining({
                    campaignId: 'campaign-1',
                    totalTransactions: 100,
                    totalVolume: 1000.5,
                }),
            })
        })
    })

    describe('notifyLowWalletBalance', () => {
        it('should send low wallet balance notification', async () => {
            const sendNotificationSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue({
                id: 'log-1',
                user_id: 'user-1',
                event_type: NotificationEventType.LOW_WALLET_BALANCE,
                status: NotificationStatus.SENT,
            } as any)

            await service.notifyLowWalletBalance({
                userId: 'user-1',
                userEmail: 'user@example.com',
                walletId: 'wallet-1',
                walletLabel: 'Main Wallet',
                currentBalance: 0.5,
            })

            expect(sendNotificationSpy).toHaveBeenCalledWith({
                eventType: NotificationEventType.LOW_WALLET_BALANCE,
                userId: 'user-1',
                recipientEmail: 'user@example.com',
                variables: expect.objectContaining({
                    walletLabel: 'Main Wallet',
                    currentBalance: '0.5000',
                }),
                metadata: expect.objectContaining({
                    walletId: 'wallet-1',
                    currentBalance: 0.5,
                }),
            })
        })
    })

    describe('getNotificationLogs', () => {
        it('should fetch notification logs for user', async () => {
            const mockLogs = [
                {
                    id: 'log-1',
                    user_id: 'user-1',
                    event_type: NotificationEventType.CAMPAIGN_STARTED,
                    status: NotificationStatus.SENT,
                },
            ]

            mockClient.limit.mockResolvedValue({ data: mockLogs, error: null })

            const result = await service.getNotificationLogs('user-1', 50)

            expect(result).toEqual(mockLogs)
            expect(mockClient.eq).toHaveBeenCalledWith('user_id', 'user-1')
            expect(mockClient.limit).toHaveBeenCalledWith(50)
        })

        it('should throw error on database failure', async () => {
            mockClient.limit.mockResolvedValue({ data: null, error: { message: 'DB error' } })

            await expect(service.getNotificationLogs('user-1')).rejects.toThrow('Failed to fetch notification logs')
        })
    })

    describe('sendBatchNotifications', () => {
        it('should send multiple notifications', async () => {
            const sendNotificationSpy = vi.spyOn(service, 'sendNotification').mockResolvedValue({
                id: 'log-1',
                user_id: 'user-1',
                event_type: NotificationEventType.CAMPAIGN_STARTED,
                status: NotificationStatus.SENT,
            } as any)

            const notifications = [
                {
                    eventType: NotificationEventType.CAMPAIGN_STARTED,
                    userId: 'user-1',
                    recipientEmail: 'user1@example.com',
                    variables: {},
                    metadata: {},
                },
                {
                    eventType: NotificationEventType.CAMPAIGN_COMPLETED,
                    userId: 'user-2',
                    recipientEmail: 'user2@example.com',
                    variables: {},
                    metadata: {},
                },
            ]

            const results = await service.sendBatchNotifications(notifications)

            expect(results).toHaveLength(2)
            expect(sendNotificationSpy).toHaveBeenCalledTimes(2)
        })
    })
})
