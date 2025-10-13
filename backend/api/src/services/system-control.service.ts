import { Injectable, Logger } from '@nestjs/common'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { SupabaseService } from './supabase.service'

interface SystemPauseState {
    paused: boolean
    timestamp: string
    reason?: string
    adminId?: string
}

interface QueueStatus {
    name: string
    paused: boolean
}

@Injectable()
export class SystemControlService {
    private readonly logger = new Logger(SystemControlService.name)
    private redis: IORedis
    private gatherQueue: Queue
    private tradeBuyQueue: Queue
    private tradeSellQueue: Queue
    private distributeQueue: Queue
    private fundsGatherQueue: Queue
    private readonly PAUSE_STATE_KEY = 'system:pause:state'

    constructor(private readonly supabase: SupabaseService) {
        this.redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379')

        // Initialize all queues
        this.gatherQueue = new Queue('gather', { connection: this.redis })
        this.tradeBuyQueue = new Queue('trade.buy', { connection: this.redis })
        this.tradeSellQueue = new Queue('trade.sell', { connection: this.redis })
        this.distributeQueue = new Queue('distribute', { connection: this.redis })
        this.fundsGatherQueue = new Queue('funds.gather', { connection: this.redis })
    }

    /**
     * Emergency pause all system operations
     */
    async pauseSystem(adminId: string, reason: string): Promise<{
        success: boolean
        paused: boolean
        timestamp: string
        queues: QueueStatus[]
    }> {
        this.logger.warn(`System pause initiated by admin ${adminId}: ${reason}`)

        const timestamp = new Date().toISOString()

        // Pause all queues
        const queues = [
            { name: 'gather', queue: this.gatherQueue },
            { name: 'trade.buy', queue: this.tradeBuyQueue },
            { name: 'trade.sell', queue: this.tradeSellQueue },
            { name: 'distribute', queue: this.distributeQueue },
            { name: 'funds.gather', queue: this.fundsGatherQueue },
        ]

        const queueStatuses: QueueStatus[] = []

        for (const { name, queue } of queues) {
            try {
                await queue.pause()
                queueStatuses.push({ name, paused: true })
                this.logger.log(`Queue ${name} paused successfully`)
            } catch (error) {
                this.logger.error(`Failed to pause queue ${name}:`, error)
                queueStatuses.push({ name, paused: false })
            }
        }

        // Store pause state in Redis
        const pauseState: SystemPauseState = {
            paused: true,
            timestamp,
            reason,
            adminId,
        }

        await this.redis.set(this.PAUSE_STATE_KEY, JSON.stringify(pauseState))

        return {
            success: true,
            paused: true,
            timestamp,
            queues: queueStatuses,
        }
    }

    /**
     * Resume all system operations
     */
    async resumeSystem(adminId: string): Promise<{
        success: boolean
        paused: boolean
        timestamp: string
        queues: QueueStatus[]
    }> {
        this.logger.log(`System resume initiated by admin ${adminId}`)

        const timestamp = new Date().toISOString()

        // Resume all queues
        const queues = [
            { name: 'gather', queue: this.gatherQueue },
            { name: 'trade.buy', queue: this.tradeBuyQueue },
            { name: 'trade.sell', queue: this.tradeSellQueue },
            { name: 'distribute', queue: this.distributeQueue },
            { name: 'funds.gather', queue: this.fundsGatherQueue },
        ]

        const queueStatuses: QueueStatus[] = []

        for (const { name, queue } of queues) {
            try {
                await queue.resume()
                queueStatuses.push({ name, paused: false })
                this.logger.log(`Queue ${name} resumed successfully`)
            } catch (error) {
                this.logger.error(`Failed to resume queue ${name}:`, error)
                queueStatuses.push({ name, paused: true })
            }
        }

        // Clear pause state in Redis
        const pauseState: SystemPauseState = {
            paused: false,
            timestamp,
            adminId,
        }

        await this.redis.set(this.PAUSE_STATE_KEY, JSON.stringify(pauseState))

        return {
            success: true,
            paused: false,
            timestamp,
            queues: queueStatuses,
        }
    }

    /**
     * Get current system pause state
     */
    async getPauseState(): Promise<SystemPauseState | null> {
        const state = await this.redis.get(this.PAUSE_STATE_KEY)
        if (!state) return null

        try {
            return JSON.parse(state)
        } catch (error) {
            this.logger.error('Failed to parse pause state:', error)
            return null
        }
    }

    /**
     * Check if system is currently paused
     */
    async isSystemPaused(): Promise<boolean> {
        const state = await this.getPauseState()
        return state?.paused ?? false
    }

    /**
     * Get comprehensive health check of all system components
     */
    async getSystemHealth(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy'
        timestamp: string
        components: {
            api: {
                status: 'healthy' | 'degraded' | 'unhealthy'
                uptime: number
                details?: string
            }
            database: {
                status: 'healthy' | 'degraded' | 'unhealthy'
                connectionPool: {
                    active: number
                    idle: number
                    total: number
                }
                details?: string
            }
            redis: {
                status: 'healthy' | 'degraded' | 'unhealthy'
                connected: boolean
                memory: {
                    used: number
                    peak: number
                }
                details?: string
            }
            queues: {
                status: 'healthy' | 'degraded' | 'unhealthy'
                details: Array<{
                    name: string
                    status: 'healthy' | 'degraded' | 'unhealthy'
                    backlog: number
                    paused: boolean
                }>
            }
            rpc: {
                status: 'healthy' | 'degraded' | 'unhealthy'
                providers: Array<{
                    name: string
                    status: 'healthy' | 'degraded' | 'unhealthy'
                    latency: number
                }>
            }
            workers: {
                status: 'healthy' | 'degraded' | 'unhealthy'
                active: number
                details?: string
            }
        }
    }> {
        const timestamp = new Date().toISOString()

        // Check API health
        const apiHealth = {
            status: 'healthy' as const,
            uptime: process.uptime(),
        }

        // Check Redis health
        let redisHealth: any
        try {
            const info = await this.redis.info('memory')
            const memoryUsedMatch = info.match(/used_memory:(\d+)/)
            const memoryPeakMatch = info.match(/used_memory_peak:(\d+)/)

            redisHealth = {
                status: 'healthy' as const,
                connected: true,
                memory: {
                    used: memoryUsedMatch ? parseInt(memoryUsedMatch[1]) : 0,
                    peak: memoryPeakMatch ? parseInt(memoryPeakMatch[1]) : 0,
                },
            }
        } catch (error) {
            redisHealth = {
                status: 'unhealthy' as const,
                connected: false,
                memory: { used: 0, peak: 0 },
                details: 'Redis connection failed',
            }
        }

        // Check database health (basic check)
        let dbHealth: any
        try {
            // Simple query to check database connection
            await this.supabase.getClient().from('campaigns').select('id').limit(1)
            dbHealth = {
                status: 'healthy' as const,
                connectionPool: {
                    active: 0,
                    idle: 0,
                    total: 0,
                },
            }
        } catch (error) {
            dbHealth = {
                status: 'unhealthy' as const,
                connectionPool: {
                    active: 0,
                    idle: 0,
                    total: 0,
                },
                details: 'Database connection failed',
            }
        }

        // Check queue health
        const queues = [
            { name: 'gather', queue: this.gatherQueue },
            { name: 'trade.buy', queue: this.tradeBuyQueue },
            { name: 'trade.sell', queue: this.tradeSellQueue },
            { name: 'distribute', queue: this.distributeQueue },
            { name: 'funds.gather', queue: this.fundsGatherQueue },
        ]

        const queueDetails = []
        let queueOverallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

        for (const { name, queue } of queues) {
            try {
                const [waiting, active, isPaused] = await Promise.all([
                    queue.getWaitingCount(),
                    queue.getActiveCount(),
                    queue.isPaused(),
                ])

                const backlog = waiting + active
                let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'

                if (isPaused) {
                    status = 'degraded'
                    queueOverallStatus = 'degraded'
                } else if (backlog > 1000) {
                    status = 'degraded'
                    if (queueOverallStatus === 'healthy') queueOverallStatus = 'degraded'
                }

                queueDetails.push({
                    name,
                    status,
                    backlog,
                    paused: isPaused,
                })
            } catch (error) {
                queueDetails.push({
                    name,
                    status: 'unhealthy' as const,
                    backlog: 0,
                    paused: false,
                })
                queueOverallStatus = 'unhealthy'
            }
        }

        // Check workers
        let totalActive = 0
        for (const { queue } of queues) {
            try {
                totalActive += await queue.getActiveCount()
            } catch (error) {
                // Ignore error
            }
        }

        const workersHealth = {
            status: 'healthy' as const,
            active: totalActive,
        }

        // RPC health (placeholder)
        const rpcHealth = {
            status: 'healthy' as const,
            providers: [
                {
                    name: 'primary',
                    status: 'healthy' as const,
                    latency: 0,
                },
            ],
        }

        // Determine overall system status
        const componentStatuses = [
            apiHealth.status,
            dbHealth.status,
            redisHealth.status,
            queueOverallStatus,
            rpcHealth.status,
            workersHealth.status,
        ]

        let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
        if (componentStatuses.includes('unhealthy')) {
            overallStatus = 'unhealthy'
        } else if (componentStatuses.includes('degraded')) {
            overallStatus = 'degraded'
        }

        return {
            status: overallStatus,
            timestamp,
            components: {
                api: apiHealth,
                database: dbHealth,
                redis: redisHealth,
                queues: {
                    status: queueOverallStatus,
                    details: queueDetails,
                },
                rpc: rpcHealth,
                workers: workersHealth,
            },
        }
    }
}
