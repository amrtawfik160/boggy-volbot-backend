import { Test, TestingModule } from '@nestjs/testing'
import { CampaignsController } from './campaigns.controller'
import { SupabaseService } from '../../../services/supabase.service'
import { AdminGuard } from '../../../guards/admin.guard'
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('CampaignsController', () => {
    let controller: CampaignsController
    let supabaseService: any

    const mockCampaign = {
        id: 'campaign-123',
        user_id: 'user-123',
        name: 'Test Campaign',
        token_id: 'token-123',
        pool_id: 'pool-123',
        status: 'active',
        params: {},
        created_at: '2025-10-13T00:00:00.000Z',
        updated_at: '2025-10-13T00:00:00.000Z',
        tokens: {
            id: 'token-123',
            symbol: 'TEST',
            mint: 'mint-address-123',
        },
        pools: {
            id: 'pool-123',
            pool_address: 'pool-address-123',
            dex: 'raydium',
        },
        users: {
            id: 'user-123',
            email: 'test@example.com',
            role: 'user',
        },
    }

    const mockRequest = {
        user: { id: 'admin-123', role: 'admin' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
    }

    beforeEach(async () => {
        supabaseService = {
            getAdminCampaigns: vi.fn().mockResolvedValue({
                data: [mockCampaign],
                total: 1,
            }),
            getAdminCampaignById: vi.fn().mockResolvedValue({ ...mockCampaign, campaign_runs: [] }),
            getAdminCampaignStats: vi.fn().mockResolvedValue({
                totalRuns: 5,
                totalJobs: 50,
                totalExecutions: 100,
                successRate: 95.5,
                totalVolume: 0,
            }),
            updateCampaignStatus: vi.fn().mockResolvedValue({
                ...mockCampaign,
                status: 'paused',
                updated_at: '2025-10-13T01:00:00.000Z',
            }),
            createAuditLog: vi.fn().mockResolvedValue({
                id: 'audit-123',
                action: 'campaign_force_pause',
                created_at: '2025-10-13T01:00:00.000Z',
            }),
            getCampaignRunsByCampaignId: vi.fn().mockResolvedValue([]),
            getClient: vi.fn().mockReturnValue({
                from: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                in: vi.fn().mockResolvedValue({ data: [], count: 0 }),
            }),
        }

        const module: TestingModule = await Test.createTestingModule({
            controllers: [CampaignsController],
            providers: [
                {
                    provide: SupabaseService,
                    useValue: supabaseService,
                },
            ],
        })
            .overrideGuard(AdminGuard)
            .useValue({
                canActivate: (context: ExecutionContext) => {
                    const request = context.switchToHttp().getRequest()
                    request.user = mockRequest.user
                    return true
                },
            })
            .compile()

        controller = module.get<CampaignsController>(CampaignsController)
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('getCampaigns', () => {
        it('should return paginated campaigns list', async () => {
            const result = await controller.getCampaigns()

            expect(result).toHaveProperty('data')
            expect(result).toHaveProperty('pagination')
            expect(result.pagination.page).toBe(1)
            expect(result.pagination.limit).toBe(20)
            expect(supabaseService.getAdminCampaigns).toHaveBeenCalledWith({
                status: undefined,
                userId: undefined,
                page: 1,
                limit: 20,
                sortBy: 'created_at',
                sortOrder: 'desc',
            })
        })

        it('should filter campaigns by status', async () => {
            await controller.getCampaigns('active')

            expect(supabaseService.getAdminCampaigns).toHaveBeenCalledWith({
                status: 'active',
                userId: undefined,
                page: 1,
                limit: 20,
                sortBy: 'created_at',
                sortOrder: 'desc',
            })
        })

        it('should filter campaigns by userId', async () => {
            await controller.getCampaigns(undefined, 'user-123')

            expect(supabaseService.getAdminCampaigns).toHaveBeenCalledWith({
                status: undefined,
                userId: 'user-123',
                page: 1,
                limit: 20,
                sortBy: 'created_at',
                sortOrder: 'desc',
            })
        })

        it('should respect pagination limits', async () => {
            await controller.getCampaigns(undefined, undefined, '2', '50')

            expect(supabaseService.getAdminCampaigns).toHaveBeenCalledWith({
                status: undefined,
                userId: undefined,
                page: 2,
                limit: 50,
                sortBy: 'created_at',
                sortOrder: 'desc',
            })
        })

        it('should enforce max limit of 100', async () => {
            await controller.getCampaigns(undefined, undefined, '1', '200')

            expect(supabaseService.getAdminCampaigns).toHaveBeenCalledWith(
                expect.objectContaining({
                    limit: 100,
                })
            )
        })

        it('should throw error for invalid pagination parameters', async () => {
            await expect(controller.getCampaigns(undefined, undefined, '0', '20')).rejects.toThrow(HttpException)
            await expect(controller.getCampaigns(undefined, undefined, '1', '0')).rejects.toThrow(HttpException)
        })
    })

    describe('getCampaignById', () => {
        it('should return campaign details with stats', async () => {
            const result = await controller.getCampaignById('campaign-123')

            expect(result).toHaveProperty('id', 'campaign-123')
            expect(result).toHaveProperty('user')
            expect(result).toHaveProperty('token')
            expect(result).toHaveProperty('pool')
            expect(result).toHaveProperty('runs')
            expect(result).toHaveProperty('stats')
            expect(supabaseService.getAdminCampaignById).toHaveBeenCalledWith('campaign-123')
            expect(supabaseService.getAdminCampaignStats).toHaveBeenCalledWith('campaign-123')
        })

        it('should throw 404 if campaign not found', async () => {
            supabaseService.getAdminCampaignById.mockResolvedValue(null)

            await expect(controller.getCampaignById('nonexistent')).rejects.toThrow(HttpException)
        })

        it('should include complete campaign structure', async () => {
            const result = await controller.getCampaignById('campaign-123')

            expect(result.user).toHaveProperty('id')
            expect(result.user).toHaveProperty('email')
            expect(result.user).toHaveProperty('role')
            expect(result.token).toHaveProperty('mint')
            expect(result.token).toHaveProperty('symbol')
            expect(result.pool).toHaveProperty('pool_address')
            expect(result.pool).toHaveProperty('dex')
        })
    })

    describe('overrideCampaign', () => {
        it('should override campaign status with force_pause', async () => {
            const body = { action: 'force_pause' as const, reason: 'Emergency maintenance' }
            const result = await controller.overrideCampaign('campaign-123', body, mockRequest as any)

            expect(result.success).toBe(true)
            expect(result.campaign.status).toBe('paused')
            expect(supabaseService.updateCampaignStatus).toHaveBeenCalledWith('campaign-123', 'paused')
            expect(supabaseService.createAuditLog).toHaveBeenCalled()
        })

        it('should map force_stop to stopped status', async () => {
            const body = { action: 'force_stop' as const, reason: 'User violation' }
            await controller.overrideCampaign('campaign-123', body, mockRequest as any)

            expect(supabaseService.updateCampaignStatus).toHaveBeenCalledWith('campaign-123', 'stopped')
        })

        it('should map force_resume to active status', async () => {
            const body = { action: 'force_resume' as const, reason: 'Issue resolved' }
            await controller.overrideCampaign('campaign-123', body, mockRequest as any)

            expect(supabaseService.updateCampaignStatus).toHaveBeenCalledWith('campaign-123', 'active')
        })

        it('should map reset to draft status', async () => {
            const body = { action: 'reset' as const, reason: 'Reset requested' }
            await controller.overrideCampaign('campaign-123', body, mockRequest as any)

            expect(supabaseService.updateCampaignStatus).toHaveBeenCalledWith('campaign-123', 'draft')
        })

        it('should create audit log with correct metadata', async () => {
            const body = { action: 'force_pause' as const, reason: 'Test reason', notifyUser: true }
            await controller.overrideCampaign('campaign-123', body, mockRequest as any)

            expect(supabaseService.createAuditLog).toHaveBeenCalledWith({
                admin_id: 'admin-123',
                user_id: 'user-123',
                action: 'campaign_force_pause',
                entity: 'campaign',
                entity_id: 'campaign-123',
                metadata: {
                    action: 'force_pause',
                    reason: 'Test reason',
                    oldStatus: 'active',
                    newStatus: 'paused',
                    notifyUser: true,
                },
                ip_address: '127.0.0.1',
                user_agent: 'test-agent',
            })
        })

        it('should throw error if action or reason missing', async () => {
            await expect(controller.overrideCampaign('campaign-123', { action: 'force_pause' as const, reason: '' }, mockRequest as any)).rejects.toThrow(HttpException)

            await expect(controller.overrideCampaign('campaign-123', { action: '' as any, reason: 'Test' }, mockRequest as any)).rejects.toThrow(HttpException)
        })

        it('should throw 404 if campaign not found', async () => {
            supabaseService.getAdminCampaignById.mockResolvedValue(null)
            const body = { action: 'force_pause' as const, reason: 'Test' }

            await expect(controller.overrideCampaign('nonexistent', body, mockRequest as any)).rejects.toThrow(HttpException)
        })

        it('should throw error for invalid action', async () => {
            const body = { action: 'invalid_action' as any, reason: 'Test' }

            await expect(controller.overrideCampaign('campaign-123', body, mockRequest as any)).rejects.toThrow(HttpException)
        })
    })
})
