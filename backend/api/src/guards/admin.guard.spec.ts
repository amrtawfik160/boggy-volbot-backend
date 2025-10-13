import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { AdminGuard } from './admin.guard'
import { supabaseAdmin } from '../config/supabase'

jest.mock('../config/supabase', () => ({
    supabaseAdmin: {
        auth: {
            getUser: jest.fn(),
        },
        from: jest.fn(),
    },
}))

describe('AdminGuard', () => {
    let guard: AdminGuard
    let mockContext: ExecutionContext
    let mockRequest: any

    beforeEach(() => {
        guard = new AdminGuard()
        mockRequest = {
            headers: {},
            user: null,
        }

        mockContext = {
            switchToHttp: () => ({
                getRequest: () => mockRequest,
            }),
        } as ExecutionContext
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('canActivate', () => {
        it('should return false if authentication fails (no auth header)', async () => {
            await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
        })

        it('should return false if authentication fails (invalid token)', async () => {
            mockRequest.headers.authorization = 'Bearer invalid-token'
            ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
                data: { user: null },
                error: new Error('Invalid token'),
            })

            await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException)
        })

        it('should throw ForbiddenException if user is not admin', async () => {
            mockRequest.headers.authorization = 'Bearer valid-token'
            mockRequest.user = { id: 'user-123' }

            // Mock successful authentication
            ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
                data: { user: { id: 'user-123' } },
                error: null,
            })

            // Mock user profile without admin role
            const mockFrom = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: { raw_user_meta_data: { role: 'user' } },
                            error: null,
                        }),
                    }),
                }),
            })
            ;(supabaseAdmin.from as jest.Mock).mockImplementation(mockFrom)

            await expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
        })

        it('should return true if user is admin', async () => {
            mockRequest.headers.authorization = 'Bearer valid-admin-token'
            mockRequest.user = { id: 'admin-123' }

            // Mock successful authentication
            ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
                data: { user: { id: 'admin-123' } },
                error: null,
            })

            // Mock user profile with admin role
            const mockFrom = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: { raw_user_meta_data: { role: 'admin' } },
                            error: null,
                        }),
                    }),
                }),
            })
            ;(supabaseAdmin.from as jest.Mock).mockImplementation(mockFrom)

            const result = await guard.canActivate(mockContext)
            expect(result).toBe(true)
        })

        it('should throw ForbiddenException if database query fails', async () => {
            mockRequest.headers.authorization = 'Bearer valid-token'
            mockRequest.user = { id: 'user-123' }

            // Mock successful authentication
            ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
                data: { user: { id: 'user-123' } },
                error: null,
            })

            // Mock database error
            const mockFrom = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: null,
                            error: new Error('Database error'),
                        }),
                    }),
                }),
            })
            ;(supabaseAdmin.from as jest.Mock).mockImplementation(mockFrom)

            await expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
        })

        it('should throw ForbiddenException if user has no role metadata', async () => {
            mockRequest.headers.authorization = 'Bearer valid-token'
            mockRequest.user = { id: 'user-123' }

            // Mock successful authentication
            ;(supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({
                data: { user: { id: 'user-123' } },
                error: null,
            })

            // Mock user profile without role
            const mockFrom = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: { raw_user_meta_data: {} },
                            error: null,
                        }),
                    }),
                }),
            })
            ;(supabaseAdmin.from as jest.Mock).mockImplementation(mockFrom)

            await expect(guard.canActivate(mockContext)).rejects.toThrow(ForbiddenException)
        })
    })
})
