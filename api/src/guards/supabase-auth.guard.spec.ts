import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnauthorizedException } from '@nestjs/common'

// Mock the Supabase client before importing
vi.mock('../config/supabase', () => ({
    supabaseAdmin: {
        auth: {
            getUser: vi.fn(),
        },
    },
    supabase: {
        auth: {
            getUser: vi.fn(),
        },
    },
    getSupabaseConfig: vi.fn(() => ({
        url: 'http://localhost:54321',
        anonKey: 'test-key',
        serviceRoleKey: 'test-service-key',
    })),
}))

import { supabaseAdmin } from '../config/supabase'
import { SupabaseAuthGuard } from './supabase-auth.guard'

describe('SupabaseAuthGuard', () => {
    let guard: SupabaseAuthGuard
    let mockExecutionContext: any

    beforeEach(() => {
        guard = new SupabaseAuthGuard()

        mockExecutionContext = {
            switchToHttp: () => ({
                getRequest: () => ({
                    headers: {},
                }),
            }),
        }

        vi.clearAllMocks()
    })

    it('should throw UnauthorizedException if no auth header', async () => {
        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should throw UnauthorizedException if auth header invalid format', async () => {
        mockExecutionContext.switchToHttp = () => ({
            getRequest: () => ({
                headers: { authorization: 'InvalidFormat' },
            }),
        })

        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(UnauthorizedException)
    })

    it('should allow access with valid token', async () => {
        const mockUser = { id: 'test-id', email: 'test@example.com' }

        vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
            data: { user: mockUser },
            error: null,
        } as any)

        const mockRequest = { headers: { authorization: 'Bearer valid-token' } }
        mockExecutionContext.switchToHttp = () => ({
            getRequest: () => mockRequest,
        })

        const result = await guard.canActivate(mockExecutionContext)

        expect(result).toBe(true)
        expect(mockRequest).toHaveProperty('user', mockUser)
    })

    it('should throw UnauthorizedException on Supabase error', async () => {
        vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid token' },
        } as any)

        mockExecutionContext.switchToHttp = () => ({
            getRequest: () => ({
                headers: { authorization: 'Bearer invalid-token' },
            }),
        })

        await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(UnauthorizedException)
    })
})
