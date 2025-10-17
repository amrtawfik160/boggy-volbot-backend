import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SystemControlService } from './system-control.service'
import { SupabaseService } from './supabase.service'
import { Queue } from 'bullmq'

// Mock BullMQ Queue
vi.mock('bullmq', () => ({
    Queue: vi.fn().mockImplementation(() => ({
        pause: vi.fn().mockResolvedValue(undefined),
        resume: vi.fn().mockResolvedValue(undefined),
        isPaused: vi.fn().mockResolvedValue(false),
        getWaitingCount: vi.fn().mockResolvedValue(10),
        getActiveCount: vi.fn().mockResolvedValue(5),
        getDelayedCount: vi.fn().mockResolvedValue(2),
        getCompletedCount: vi.fn().mockResolvedValue(100),
        getFailedCount: vi.fn().mockResolvedValue(3),
    })),
}))

// Mock IORedis
vi.mock('ioredis', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            set: vi.fn().mockResolvedValue('OK'),
            get: vi.fn().mockResolvedValue(null),
            info: vi.fn().mockResolvedValue('used_memory:1000000\nused_memory_peak:2000000\nconnected_clients:10'),
        })),
    }
})

describe('SystemControlService', () => {
    let service: SystemControlService
    let mockSupabase: any

    beforeEach(() => {
        mockSupabase = {
            getClient: vi.fn().mockReturnValue({
                from: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
        }

        service = new SystemControlService(mockSupabase)
    })

    describe('pauseSystem', () => {
        it('should pause all queues and store pause state', async () => {
            const result = await service.pauseSystem('admin-123', 'Emergency maintenance')

            expect(result.success).toBe(true)
            expect(result.paused).toBe(true)
            expect(result.queues).toHaveLength(5)
            expect(result.queues.every(q => q.paused === true)).toBe(true)
            expect(result.timestamp).toBeDefined()
        })

        it('should handle queue pause failures gracefully', async () => {
            // Mock one queue to fail
            const mockQueue = {
                pause: vi.fn().mockRejectedValue(new Error('Queue error')),
            }

            // Override one queue instance
            ;(service as any).gatherQueue = mockQueue

            const result = await service.pauseSystem('admin-123', 'Test')

            expect(result.success).toBe(true)
            expect(result.queues.some(q => q.paused === false)).toBe(true)
        })
    })

    describe('resumeSystem', () => {
        it('should resume all queues and clear pause state', async () => {
            const result = await service.resumeSystem('admin-123')

            expect(result.success).toBe(true)
            expect(result.paused).toBe(false)
            expect(result.queues).toHaveLength(5)
            expect(result.queues.every(q => q.paused === false)).toBe(true)
            expect(result.timestamp).toBeDefined()
        })

        it('should handle queue resume failures gracefully', async () => {
            const mockQueue = {
                resume: vi.fn().mockRejectedValue(new Error('Queue error')),
            }

            ;(service as any).tradeBuyQueue = mockQueue

            const result = await service.resumeSystem('admin-123')

            expect(result.success).toBe(true)
            expect(result.queues.some(q => q.paused === true)).toBe(true)
        })
    })

    describe('getPauseState', () => {
        it('should return null when no pause state exists', async () => {
            const state = await service.getPauseState()
            expect(state).toBeNull()
        })

        it('should return pause state when it exists', async () => {
            const mockPauseState = {
                paused: true,
                timestamp: new Date().toISOString(),
                reason: 'Test',
                adminId: 'admin-123',
            }

            ;(service as any).redis.get = vi.fn().mockResolvedValue(JSON.stringify(mockPauseState))

            const state = await service.getPauseState()
            expect(state).toEqual(mockPauseState)
        })

        it('should handle invalid JSON gracefully', async () => {
            ;(service as any).redis.get = vi.fn().mockResolvedValue('invalid json')

            const state = await service.getPauseState()
            expect(state).toBeNull()
        })
    })

    describe('isSystemPaused', () => {
        it('should return false when system is not paused', async () => {
            const isPaused = await service.isSystemPaused()
            expect(isPaused).toBe(false)
        })

        it('should return true when system is paused', async () => {
            const mockPauseState = {
                paused: true,
                timestamp: new Date().toISOString(),
                reason: 'Test',
            }

            ;(service as any).redis.get = vi.fn().mockResolvedValue(JSON.stringify(mockPauseState))

            const isPaused = await service.isSystemPaused()
            expect(isPaused).toBe(true)
        })
    })

    describe('getSystemHealth', () => {
        it('should return comprehensive health check', async () => {
            const health = await service.getSystemHealth()

            expect(health.status).toBeDefined()
            expect(health.timestamp).toBeDefined()
            expect(health.components).toBeDefined()
            expect(health.components.api).toBeDefined()
            expect(health.components.database).toBeDefined()
            expect(health.components.redis).toBeDefined()
            expect(health.components.queues).toBeDefined()
            expect(health.components.rpc).toBeDefined()
            expect(health.components.workers).toBeDefined()
        })

        it('should return healthy status when all components are healthy', async () => {
            const health = await service.getSystemHealth()

            expect(health.status).toBe('healthy')
            expect(health.components.api.status).toBe('healthy')
            expect(health.components.redis.status).toBe('healthy')
        })

        it('should return degraded status when queues are paused', async () => {
            // Mock paused queue
            ;(service as any).gatherQueue.isPaused = vi.fn().mockResolvedValue(true)

            const health = await service.getSystemHealth()

            expect(health.status).toBe('degraded')
            expect(health.components.queues.status).toBe('degraded')
        })

        it('should return unhealthy status when Redis is down', async () => {
            ;(service as any).redis.info = vi.fn().mockRejectedValue(new Error('Connection failed'))

            const health = await service.getSystemHealth()

            expect(health.status).toBe('unhealthy')
            expect(health.components.redis.status).toBe('unhealthy')
            expect(health.components.redis.connected).toBe(false)
        })

        it('should include queue details with backlog information', async () => {
            const health = await service.getSystemHealth()

            expect(health.components.queues.details).toHaveLength(5)
            health.components.queues.details.forEach(queue => {
                expect(queue.name).toBeDefined()
                expect(queue.status).toBeDefined()
                expect(queue.backlog).toBeGreaterThanOrEqual(0)
                expect(typeof queue.paused).toBe('boolean')
            })
        })

        it('should mark queue as degraded when backlog is high', async () => {
            // Mock high backlog
            ;(service as any).gatherQueue.getWaitingCount = vi.fn().mockResolvedValue(2000)
            ;(service as any).gatherQueue.getActiveCount = vi.fn().mockResolvedValue(500)

            const health = await service.getSystemHealth()

            const gatherQueue = health.components.queues.details.find(q => q.name === 'gather')
            expect(gatherQueue?.status).toBe('degraded')
            expect(gatherQueue?.backlog).toBeGreaterThan(1000)
        })
    })
})
