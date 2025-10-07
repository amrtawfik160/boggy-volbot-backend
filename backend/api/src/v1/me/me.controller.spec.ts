import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MeController } from './me.controller'

describe('MeController', () => {
    let controller: MeController

    beforeEach(() => {
        controller = new MeController()
    })

    describe('getMe', () => {
        it('should return user profile from authenticated user', () => {
            const mockUser = {
                id: 'test-user-id',
                email: 'test@example.com',
                user_metadata: { role: 'user' },
            }

            const result = controller.getMe(mockUser)

            expect(result).toEqual({
                id: 'test-user-id',
                email: 'test@example.com',
                role: 'user',
            })
        })

        it('should default role to user if not in metadata', () => {
            const mockUser = {
                id: 'test-user-id',
                email: 'test@example.com',
                user_metadata: {},
            }

            const result = controller.getMe(mockUser)

            expect(result.role).toBe('user')
        })

        it('should handle admin role', () => {
            const mockUser = {
                id: 'admin-user-id',
                email: 'admin@example.com',
                user_metadata: { role: 'admin' },
            }

            const result = controller.getMe(mockUser)

            expect(result.role).toBe('admin')
        })
    })
})
