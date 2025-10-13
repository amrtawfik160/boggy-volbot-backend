import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SystemControlController } from './system-control.controller'
import { SystemControlService } from '../../../services/system-control.service'
import { SupabaseService } from '../../../services/supabase.service'

describe('SystemControlController', () => {
    let controller: SystemControlController
    let mockSystemControl: any
    let mockSupabase: any

    beforeEach(() => {
        mockSystemControl = {
            pauseSystem: vi.fn(),
            resumeSystem: vi.fn(),
            getSystemHealth: vi.fn(),
            getPauseState: vi.fn(),
        }

        mockSupabase = {
            createAuditLog: vi.fn(),
        }

        controller = new SystemControlController(mockSystemControl, mockSupabase)
    })

    describe('pauseSystem', () => {
        const mockRequest = {
            user: { id: 'admin-123' },
            ip: '192.168.1.1',
            headers: { 'user-agent': 'Mozilla/5.0' },
        }

        it('should pause system and create audit log', async () => {
            const pauseResult = {
                success: true,
                paused: true,
                timestamp: '2024-01-01T00:00:00Z',
                queues: [
                    { name: 'gather', paused: true },
                    { name: 'trade.buy', paused: true },
                ],
            }

            mockSystemControl.pauseSystem.mockResolvedValue(pauseResult)
            mockSupabase.createAuditLog.mockResolvedValue({ id: 'audit-123' })

            const dto = { reason: 'Emergency maintenance', notifyUsers: false }
            const result = await controller.pauseSystem(dto, mockRequest)

            expect(result).toEqual(pauseResult)
            expect(mockSystemControl.pauseSystem).toHaveBeenCalledWith('admin-123', 'Emergency maintenance')
            expect(mockSupabase.createAuditLog).toHaveBeenCalledWith({
                admin_id: 'admin-123',
                action: 'system.pause',
                entity: 'system',
                metadata: {
                    reason: 'Emergency maintenance',
                    notifyUsers: false,
                    queues: pauseResult.queues,
                },
                ip_address: '192.168.1.1',
                user_agent: 'Mozilla/5.0',
            })
        })

        it('should handle notifyUsers flag', async () => {
            const pauseResult = {
                success: true,
                paused: true,
                timestamp: '2024-01-01T00:00:00Z',
                queues: [],
            }

            mockSystemControl.pauseSystem.mockResolvedValue(pauseResult)
            mockSupabase.createAuditLog.mockResolvedValue({ id: 'audit-123' })

            const dto = { reason: 'Maintenance', notifyUsers: true }
            await controller.pauseSystem(dto, mockRequest)

            expect(mockSupabase.createAuditLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    metadata: expect.objectContaining({
                        notifyUsers: true,
                    }),
                })
            )
        })

        it('should use correct admin ID from request', async () => {
            const customRequest = {
                ...mockRequest,
                user: { id: 'different-admin' },
            }

            mockSystemControl.pauseSystem.mockResolvedValue({
                success: true,
                paused: true,
                timestamp: '2024-01-01T00:00:00Z',
                queues: [],
            })
            mockSupabase.createAuditLog.mockResolvedValue({ id: 'audit-123' })

            const dto = { reason: 'Test' }
            await controller.pauseSystem(dto, customRequest)

            expect(mockSystemControl.pauseSystem).toHaveBeenCalledWith('different-admin', 'Test')
        })
    })

    describe('resumeSystem', () => {
        const mockRequest = {
            user: { id: 'admin-123' },
            ip: '192.168.1.1',
            headers: { 'user-agent': 'Mozilla/5.0' },
        }

        it('should resume system and create audit log', async () => {
            const resumeResult = {
                success: true,
                paused: false,
                timestamp: '2024-01-01T00:00:00Z',
                queues: [
                    { name: 'gather', paused: false },
                    { name: 'trade.buy', paused: false },
                ],
            }

            mockSystemControl.resumeSystem.mockResolvedValue(resumeResult)
            mockSupabase.createAuditLog.mockResolvedValue({ id: 'audit-123' })

            const result = await controller.resumeSystem(mockRequest)

            expect(result).toEqual(resumeResult)
            expect(mockSystemControl.resumeSystem).toHaveBeenCalledWith('admin-123')
            expect(mockSupabase.createAuditLog).toHaveBeenCalledWith({
                admin_id: 'admin-123',
                action: 'system.resume',
                entity: 'system',
                metadata: {
                    queues: resumeResult.queues,
                },
                ip_address: '192.168.1.1',
                user_agent: 'Mozilla/5.0',
            })
        })

        it('should track IP address and user agent', async () => {
            const customRequest = {
                user: { id: 'admin-123' },
                ip: '10.0.0.1',
                headers: { 'user-agent': 'Custom-Agent/1.0' },
            }

            mockSystemControl.resumeSystem.mockResolvedValue({
                success: true,
                paused: false,
                timestamp: '2024-01-01T00:00:00Z',
                queues: [],
            })
            mockSupabase.createAuditLog.mockResolvedValue({ id: 'audit-123' })

            await controller.resumeSystem(customRequest)

            expect(mockSupabase.createAuditLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    ip_address: '10.0.0.1',
                    user_agent: 'Custom-Agent/1.0',
                })
            )
        })
    })

    describe('getSystemHealth', () => {
        it('should return comprehensive system health', async () => {
            const mockHealth = {
                status: 'healthy' as const,
                timestamp: '2024-01-01T00:00:00Z',
                components: {
                    api: { status: 'healthy' as const, uptime: 1000 },
                    database: {
                        status: 'healthy' as const,
                        connectionPool: { active: 5, idle: 10, total: 15 },
                    },
                    redis: {
                        status: 'healthy' as const,
                        connected: true,
                        memory: { used: 1000000, peak: 2000000 },
                    },
                    queues: {
                        status: 'healthy' as const,
                        details: [
                            { name: 'gather', status: 'healthy' as const, backlog: 10, paused: false },
                        ],
                    },
                    rpc: {
                        status: 'healthy' as const,
                        providers: [
                            { name: 'primary', status: 'healthy' as const, latency: 50 },
                        ],
                    },
                    workers: { status: 'healthy' as const, active: 5 },
                },
            }

            mockSystemControl.getSystemHealth.mockResolvedValue(mockHealth)

            const result = await controller.getSystemHealth()

            expect(result).toEqual(mockHealth)
            expect(mockSystemControl.getSystemHealth).toHaveBeenCalled()
        })

        it('should return degraded status when components are degraded', async () => {
            const mockHealth = {
                status: 'degraded' as const,
                timestamp: '2024-01-01T00:00:00Z',
                components: {
                    api: { status: 'healthy' as const, uptime: 1000 },
                    database: {
                        status: 'healthy' as const,
                        connectionPool: { active: 5, idle: 10, total: 15 },
                    },
                    redis: {
                        status: 'healthy' as const,
                        connected: true,
                        memory: { used: 1000000, peak: 2000000 },
                    },
                    queues: {
                        status: 'degraded' as const,
                        details: [
                            { name: 'gather', status: 'degraded' as const, backlog: 2000, paused: true },
                        ],
                    },
                    rpc: {
                        status: 'healthy' as const,
                        providers: [],
                    },
                    workers: { status: 'healthy' as const, active: 5 },
                },
            }

            mockSystemControl.getSystemHealth.mockResolvedValue(mockHealth)

            const result = await controller.getSystemHealth()

            expect(result.status).toBe('degraded')
            expect(result.components.queues.status).toBe('degraded')
        })
    })

    describe('getSystemStatus', () => {
        it('should return current pause state and health status', async () => {
            const mockPauseState = {
                paused: true,
                timestamp: '2024-01-01T00:00:00Z',
                reason: 'Maintenance',
                adminId: 'admin-123',
            }

            const mockHealth = {
                status: 'healthy' as const,
                timestamp: '2024-01-01T00:00:00Z',
                components: {} as any,
            }

            mockSystemControl.getPauseState.mockResolvedValue(mockPauseState)
            mockSystemControl.getSystemHealth.mockResolvedValue(mockHealth)

            const result = await controller.getSystemStatus()

            expect(result.paused).toBe(true)
            expect(result.pauseState).toEqual(mockPauseState)
            expect(result.health).toBe('healthy')
            expect(result.timestamp).toBeDefined()
        })

        it('should return not paused when no pause state exists', async () => {
            mockSystemControl.getPauseState.mockResolvedValue(null)
            mockSystemControl.getSystemHealth.mockResolvedValue({
                status: 'healthy' as const,
                timestamp: '2024-01-01T00:00:00Z',
                components: {} as any,
            })

            const result = await controller.getSystemStatus()

            expect(result.paused).toBe(false)
            expect(result.pauseState).toBeNull()
        })

        it('should include both pause state and health in response', async () => {
            mockSystemControl.getPauseState.mockResolvedValue({
                paused: false,
                timestamp: '2024-01-01T00:00:00Z',
            })
            mockSystemControl.getSystemHealth.mockResolvedValue({
                status: 'degraded' as const,
                timestamp: '2024-01-01T00:00:00Z',
                components: {} as any,
            })

            const result = await controller.getSystemStatus()

            expect(result.paused).toBe(false)
            expect(result.health).toBe('degraded')
            expect(result.pauseState).toBeDefined()
            expect(result.timestamp).toBeDefined()
        })
    })
})
