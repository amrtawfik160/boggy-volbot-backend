import { Test, TestingModule } from '@nestjs/testing'
import { UsersController } from './users.controller'
import { SupabaseService } from '../../../services/supabase.service'
import { AdminGuard } from '../../../guards/admin.guard'
import { ExecutionContext, HttpException } from '@nestjs/common'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('UsersController', () => {
    let controller: UsersController
    let supabaseService: any

    const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        status: 'active',
        created_at: '2025-10-13T00:00:00.000Z',
        updated_at: '2025-10-13T00:00:00.000Z',
        last_sign_in_at: '2025-10-13T00:00:00.000Z',
    }

    const mockCampaigns = [
        { id: 'camp-1', name: 'Campaign 1', status: 'active', created_at: '2025-10-13T00:00:00.000Z' },
        { id: 'camp-2', name: 'Campaign 2', status: 'paused', created_at: '2025-10-13T00:00:00.000Z' },
    ]

    const mockWallets = [
        { id: 'wallet-1', address: 'address-1', label: 'Wallet 1', is_active: true },
        { id: 'wallet-2', address: 'address-2', label: 'Wallet 2', is_active: false },
    ]

    const mockStats = {
        totalCampaigns: 2,
        totalWallets: 2,
        totalRuns: 10,
        totalJobs: 100,
        totalTransactions: 500,
        totalVolume: 0,
        successRate: 95.5,
    }

    const mockActivity = [
        {
            id: 'activity-1',
            action: 'campaign_created',
            entity: 'campaign',
            timestamp: '2025-10-13T00:00:00.000Z',
            metadata: {},
        },
    ]

    const mockRequest = {
        user: { id: 'admin-123', role: 'admin' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
    }

    beforeEach(async () => {
        supabaseService = {
            getAdminUsers: vi.fn().mockResolvedValue({
                data: [mockUser],
                total: 1,
            }),
            getAdminUserById: vi.fn().mockResolvedValue(mockUser),
            getAdminUserCampaigns: vi.fn().mockResolvedValue(mockCampaigns),
            getAdminUserWallets: vi.fn().mockResolvedValue(mockWallets),
            getAdminUserStats: vi.fn().mockResolvedValue(mockStats),
            getAdminUserActivity: vi.fn().mockResolvedValue(mockActivity),
            updateUserRoleAndStatus: vi.fn().mockResolvedValue({
                ...mockUser,
                role: 'admin',
                updated_at: '2025-10-13T01:00:00.000Z',
            }),
            createAuditLog: vi.fn().mockResolvedValue({
                id: 'audit-123',
                action: 'user_update',
                created_at: '2025-10-13T01:00:00.000Z',
            }),
        }

        const module: TestingModule = await Test.createTestingModule({
            controllers: [UsersController],
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

        controller = module.get<UsersController>(UsersController)
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('getUsers', () => {
        it('should return paginated users list', async () => {
            const result = await controller.getUsers()

            expect(result).toHaveProperty('data')
            expect(result).toHaveProperty('pagination')
            expect(result.pagination.page).toBe(1)
            expect(result.pagination.limit).toBe(20)
            expect(supabaseService.getAdminUsers).toHaveBeenCalledWith({
                role: undefined,
                status: undefined,
                search: undefined,
                page: 1,
                limit: 20,
            })
        })

        it('should filter users by role', async () => {
            await controller.getUsers('admin')

            expect(supabaseService.getAdminUsers).toHaveBeenCalledWith({
                role: 'admin',
                status: undefined,
                search: undefined,
                page: 1,
                limit: 20,
            })
        })

        it('should filter users by status', async () => {
            await controller.getUsers(undefined, 'suspended')

            expect(supabaseService.getAdminUsers).toHaveBeenCalledWith({
                role: undefined,
                status: 'suspended',
                search: undefined,
                page: 1,
                limit: 20,
            })
        })

        it('should search users', async () => {
            await controller.getUsers(undefined, undefined, 'test@example.com')

            expect(supabaseService.getAdminUsers).toHaveBeenCalledWith({
                role: undefined,
                status: undefined,
                search: 'test@example.com',
                page: 1,
                limit: 20,
            })
        })

        it('should respect pagination parameters', async () => {
            await controller.getUsers(undefined, undefined, undefined, '2', '50')

            expect(supabaseService.getAdminUsers).toHaveBeenCalledWith({
                role: undefined,
                status: undefined,
                search: undefined,
                page: 2,
                limit: 50,
            })
        })

        it('should enforce max limit of 100', async () => {
            await controller.getUsers(undefined, undefined, undefined, '1', '200')

            expect(supabaseService.getAdminUsers).toHaveBeenCalledWith(
                expect.objectContaining({
                    limit: 100,
                })
            )
        })

        it('should throw error for invalid pagination parameters', async () => {
            await expect(controller.getUsers(undefined, undefined, undefined, '0', '20')).rejects.toThrow(HttpException)
            await expect(controller.getUsers(undefined, undefined, undefined, '1', '0')).rejects.toThrow(HttpException)
        })

        it('should include user stats in response', async () => {
            const result = await controller.getUsers()

            expect(result.data[0]).toHaveProperty('stats')
            expect(result.data[0].stats).toHaveProperty('totalCampaigns')
            expect(result.data[0].stats).toHaveProperty('activeCampaigns')
            expect(result.data[0].stats).toHaveProperty('totalWallets')
        })
    })

    describe('getUserById', () => {
        it('should return user details with all related data', async () => {
            const result = await controller.getUserById('user-123')

            expect(result).toHaveProperty('id', 'user-123')
            expect(result).toHaveProperty('email')
            expect(result).toHaveProperty('role')
            expect(result).toHaveProperty('campaigns')
            expect(result).toHaveProperty('wallets')
            expect(result).toHaveProperty('stats')
            expect(result).toHaveProperty('activity')
            expect(supabaseService.getAdminUserById).toHaveBeenCalledWith('user-123')
            expect(supabaseService.getAdminUserCampaigns).toHaveBeenCalledWith('user-123')
            expect(supabaseService.getAdminUserWallets).toHaveBeenCalledWith('user-123')
            expect(supabaseService.getAdminUserStats).toHaveBeenCalledWith('user-123')
            expect(supabaseService.getAdminUserActivity).toHaveBeenCalledWith('user-123', 50)
        })

        it('should throw 404 if user not found', async () => {
            supabaseService.getAdminUserById.mockResolvedValue(null)

            await expect(controller.getUserById('nonexistent')).rejects.toThrow(HttpException)
        })

        it('should return campaigns array', async () => {
            const result = await controller.getUserById('user-123')

            expect(Array.isArray(result.campaigns)).toBe(true)
            expect(result.campaigns).toHaveLength(2)
        })

        it('should return wallets array', async () => {
            const result = await controller.getUserById('user-123')

            expect(Array.isArray(result.wallets)).toBe(true)
            expect(result.wallets).toHaveLength(2)
        })

        it('should return activity array', async () => {
            const result = await controller.getUserById('user-123')

            expect(Array.isArray(result.activity)).toBe(true)
            expect(result.activity).toHaveLength(1)
        })
    })

    describe('updateUser', () => {
        it('should update user role', async () => {
            const body = { role: 'admin' as const, reason: 'Promotion to admin' }
            const result = await controller.updateUser('user-123', body, mockRequest as any)

            expect(result.success).toBe(true)
            expect(result.user.role).toBe('admin')
            expect(supabaseService.updateUserRoleAndStatus).toHaveBeenCalledWith('user-123', { role: 'admin' })
        })

        it('should update user status', async () => {
            const body = { status: 'suspended' as const, reason: 'Terms violation' }
            await controller.updateUser('user-123', body, mockRequest as any)

            expect(supabaseService.updateUserRoleAndStatus).toHaveBeenCalledWith('user-123', { status: 'suspended' })
        })

        it('should update both role and status', async () => {
            const body = { role: 'admin' as const, status: 'active' as const, reason: 'Admin activation' }
            await controller.updateUser('user-123', body, mockRequest as any)

            expect(supabaseService.updateUserRoleAndStatus).toHaveBeenCalledWith('user-123', {
                role: 'admin',
                status: 'active',
            })
        })

        it('should create audit log', async () => {
            const body = { role: 'admin' as const, reason: 'Test reason' }
            await controller.updateUser('user-123', body, mockRequest as any)

            expect(supabaseService.createAuditLog).toHaveBeenCalledWith({
                admin_id: 'admin-123',
                user_id: 'user-123',
                action: 'user_update',
                entity: 'user',
                entity_id: 'user-123',
                metadata: {
                    changes: { role: 'admin' },
                    reason: 'Test reason',
                    oldRole: 'user',
                    oldStatus: 'active',
                },
                ip_address: '127.0.0.1',
                user_agent: 'test-agent',
            })
        })

        it('should throw error if reason is missing', async () => {
            const body = { role: 'admin' as const, reason: '' }

            await expect(controller.updateUser('user-123', body, mockRequest as any)).rejects.toThrow(HttpException)
        })

        it('should throw error if neither role nor status provided', async () => {
            const body = { reason: 'Test' } as any

            await expect(controller.updateUser('user-123', body, mockRequest as any)).rejects.toThrow(HttpException)
        })

        it('should throw 404 if user not found', async () => {
            supabaseService.getAdminUserById.mockResolvedValue(null)
            const body = { role: 'admin' as const, reason: 'Test' }

            await expect(controller.updateUser('nonexistent', body, mockRequest as any)).rejects.toThrow(HttpException)
        })

        it('should return audit log in response', async () => {
            const body = { role: 'admin' as const, reason: 'Test reason' }
            const result = await controller.updateUser('user-123', body, mockRequest as any)

            expect(result).toHaveProperty('audit')
            expect(result.audit).toHaveProperty('id')
            expect(result.audit).toHaveProperty('action')
            expect(result.audit).toHaveProperty('reason')
            expect(result.audit).toHaveProperty('timestamp')
        })
    })
})
