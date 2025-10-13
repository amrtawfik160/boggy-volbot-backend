import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OverrideService } from './override.service'
import { SupabaseService } from './supabase.service'
import { BadRequestException, NotFoundException } from '@nestjs/common'

describe('OverrideService', () => {
    let service: OverrideService
    let mockSupabase: any

    beforeEach(() => {
        mockSupabase = {
            getAdminCampaignById: vi.fn(),
            updateCampaignStatus: vi.fn(),
            createAuditLog: vi.fn(),
            getClient: vi.fn(),
        }

        service = new OverrideService(mockSupabase)
    })

    describe('overrideCampaign', () => {
        const mockCampaign = {
            id: 'campaign-123',
            user_id: 'user-456',
            name: 'Test Campaign',
            status: 'active',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
        }

        const mockUpdatedCampaign = {
            ...mockCampaign,
            status: 'paused',
            updated_at: '2024-01-02T00:00:00Z',
        }

        const mockAuditLog = {
            id: 'audit-789',
            action: 'campaign.override.force_pause',
            created_at: '2024-01-02T00:00:00Z',
        }

        beforeEach(() => {
            mockSupabase.getAdminCampaignById.mockResolvedValue(mockCampaign)
            mockSupabase.updateCampaignStatus.mockResolvedValue(mockUpdatedCampaign)
            mockSupabase.createAuditLog.mockResolvedValue(mockAuditLog)
        })

        it('should successfully override campaign with force_pause', async () => {
            const result = await service.overrideCampaign(
                'campaign-123',
                'admin-123',
                'force_pause',
                'Emergency maintenance'
            )

            expect(result.success).toBe(true)
            expect(result.campaign.id).toBe('campaign-123')
            expect(result.campaign.status).toBe('paused')
            expect(result.audit.action).toBe('campaign.override.force_pause')
            expect(mockSupabase.updateCampaignStatus).toHaveBeenCalledWith('campaign-123', 'paused')
        })

        it('should successfully override campaign with force_stop', async () => {
            mockSupabase.updateCampaignStatus.mockResolvedValue({ ...mockCampaign, status: 'stopped' })

            const result = await service.overrideCampaign(
                'campaign-123',
                'admin-123',
                'force_stop',
                'Manual stop'
            )

            expect(result.success).toBe(true)
            expect(mockSupabase.updateCampaignStatus).toHaveBeenCalledWith('campaign-123', 'stopped')
        })

        it('should successfully override campaign with force_resume', async () => {
            mockSupabase.updateCampaignStatus.mockResolvedValue({ ...mockCampaign, status: 'active' })

            const result = await service.overrideCampaign(
                'campaign-123',
                'admin-123',
                'force_resume',
                'Resume after fix'
            )

            expect(result.success).toBe(true)
            expect(mockSupabase.updateCampaignStatus).toHaveBeenCalledWith('campaign-123', 'active')
        })

        it('should successfully override campaign with reset', async () => {
            mockSupabase.updateCampaignStatus.mockResolvedValue({ ...mockCampaign, status: 'draft' })

            const result = await service.overrideCampaign(
                'campaign-123',
                'admin-123',
                'reset',
                'Reset configuration'
            )

            expect(result.success).toBe(true)
            expect(mockSupabase.updateCampaignStatus).toHaveBeenCalledWith('campaign-123', 'draft')
        })

        it('should throw BadRequestException for invalid action', async () => {
            await expect(
                service.overrideCampaign(
                    'campaign-123',
                    'admin-123',
                    'invalid_action' as any,
                    'Test'
                )
            ).rejects.toThrow(BadRequestException)
        })

        it('should throw NotFoundException when campaign does not exist', async () => {
            mockSupabase.getAdminCampaignById.mockResolvedValue(null)

            await expect(
                service.overrideCampaign(
                    'nonexistent',
                    'admin-123',
                    'force_pause',
                    'Test'
                )
            ).rejects.toThrow(NotFoundException)
        })

        it('should create audit log with correct metadata', async () => {
            await service.overrideCampaign(
                'campaign-123',
                'admin-123',
                'force_pause',
                'Emergency',
                true,
                '192.168.1.1',
                'Mozilla/5.0'
            )

            expect(mockSupabase.createAuditLog).toHaveBeenCalledWith({
                admin_id: 'admin-123',
                user_id: 'user-456',
                action: 'campaign.override.force_pause',
                entity: 'campaign',
                entity_id: 'campaign-123',
                metadata: {
                    action: 'force_pause',
                    reason: 'Emergency',
                    oldStatus: 'active',
                    newStatus: 'paused',
                    notifyUser: true,
                },
                ip_address: '192.168.1.1',
                user_agent: 'Mozilla/5.0',
            })
        })

        it('should handle notifyUser flag', async () => {
            const result = await service.overrideCampaign(
                'campaign-123',
                'admin-123',
                'force_pause',
                'Test',
                true
            )

            expect(result.success).toBe(true)
            expect(mockSupabase.createAuditLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        notifyUser: true,
                    }),
                })
            )
        })
    })

    describe('validateOverrideAction', () => {
        it('should validate force_pause on active campaign', () => {
            const result = service.validateOverrideAction('active', 'force_pause')
            expect(result.valid).toBe(true)
        })

        it('should validate force_stop on paused campaign', () => {
            const result = service.validateOverrideAction('paused', 'force_stop')
            expect(result.valid).toBe(true)
        })

        it('should validate force_resume on stopped campaign', () => {
            const result = service.validateOverrideAction('stopped', 'force_resume')
            expect(result.valid).toBe(true)
        })

        it('should validate reset on any status', () => {
            const statuses = ['draft', 'active', 'paused', 'stopped', 'completed']
            statuses.forEach(status => {
                const result = service.validateOverrideAction(status, 'reset')
                expect(result.valid).toBe(true)
            })
        })

        it('should reject invalid action', () => {
            const result = service.validateOverrideAction('active', 'invalid' as any)
            expect(result.valid).toBe(false)
            expect(result.message).toContain('Unknown action')
        })

        it('should allow force_pause on already paused campaign', () => {
            const result = service.validateOverrideAction('paused', 'force_pause')
            expect(result.valid).toBe(true)
        })
    })

    describe('getCampaignOverrideHistory', () => {
        it('should fetch override history for campaign', async () => {
            const mockHistory = [
                {
                    id: 'audit-1',
                    action: 'campaign.override.force_pause',
                    created_at: '2024-01-01T00:00:00Z',
                },
                {
                    id: 'audit-2',
                    action: 'campaign.override.force_resume',
                    created_at: '2024-01-02T00:00:00Z',
                },
            ]

            const mockQueryBuilder = {
                from: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                like: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue({ data: mockHistory, error: null }),
            }

            mockSupabase.getClient.mockReturnValue(mockQueryBuilder)

            const result = await service.getCampaignOverrideHistory('campaign-123')

            expect(result).toEqual(mockHistory)
            expect(mockQueryBuilder.eq).toHaveBeenCalledWith('entity', 'campaign')
            expect(mockQueryBuilder.eq).toHaveBeenCalledWith('entity_id', 'campaign-123')
            expect(mockQueryBuilder.like).toHaveBeenCalledWith('action', 'campaign.override.%')
        })

        it('should use custom limit', async () => {
            const mockQueryBuilder = {
                from: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                like: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }

            mockSupabase.getClient.mockReturnValue(mockQueryBuilder)

            await service.getCampaignOverrideHistory('campaign-123', 25)

            expect(mockQueryBuilder.limit).toHaveBeenCalledWith(25)
        })

        it('should throw error on database failure', async () => {
            const mockQueryBuilder = {
                from: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                like: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
            }

            mockSupabase.getClient.mockReturnValue(mockQueryBuilder)

            await expect(
                service.getCampaignOverrideHistory('campaign-123')
            ).rejects.toThrow('DB error')
        })
    })

    describe('getRecentOverrides', () => {
        it('should fetch recent override actions', async () => {
            const mockOverrides = [
                {
                    id: 'audit-1',
                    entity_id: 'campaign-123',
                    action: 'campaign.override.force_pause',
                    created_at: '2024-01-01T00:00:00Z',
                },
            ]

            const mockQueryBuilder = {
                from: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                like: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue({ data: mockOverrides, error: null }),
            }

            mockSupabase.getClient.mockReturnValue(mockQueryBuilder)

            const result = await service.getRecentOverrides()

            expect(result).toEqual(mockOverrides)
            expect(mockQueryBuilder.eq).toHaveBeenCalledWith('entity', 'campaign')
            expect(mockQueryBuilder.like).toHaveBeenCalledWith('action', 'campaign.override.%')
        })

        it('should use custom limit', async () => {
            const mockQueryBuilder = {
                from: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                like: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }

            mockSupabase.getClient.mockReturnValue(mockQueryBuilder)

            await service.getRecentOverrides(50)

            expect(mockQueryBuilder.limit).toHaveBeenCalledWith(50)
        })
    })
})
