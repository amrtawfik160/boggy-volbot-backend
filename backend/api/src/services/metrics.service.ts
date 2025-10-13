import { Injectable } from '@nestjs/common'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import * as os from 'os'
import { SupabaseService } from './supabase.service'

interface SystemMetrics {
    timestamp: string
    system: {
        uptime: number
        cpu: {
            usage: number
            cores: number
        }
        memory: {
            used: number
            total: number
            percentage: number
        }
        redis: {
            connected: boolean
            memoryUsed: number
            memoryPeak: number
            connectedClients: number
        }
        database: {
            connected: boolean
            activeConnections: number
            idleConnections: number
            totalConnections: number
        }
    }
    api: {
        totalRequests: number
        errorRate: number
        avgResponseTime: number
        p95ResponseTime: number
        p99ResponseTime: number
    }
    workers: {
        active: number
        completed: number
        failed: number
        avgProcessingTime: number
    }
}

interface QueueMetrics {
    timestamp: string
    queues: {
        [queueName: string]: {
            name: string
            waiting: number
            active: number
            completed: number
            failed: number
            delayed: number
            paused: boolean
            metrics: {
                throughput: number
                avgWaitTime: number
                avgProcessingTime: number
                errorRate: number
            }
        }
    }
}

interface RPCMetrics {
    timestamp: string
    providers: Array<{
        name: string
        url: string
        status: 'healthy' | 'degraded' | 'down'
        metrics: {
            totalRequests: number
            successRate: number
            avgLatency: number
            p95Latency: number
            errorRate: number
            lastError?: string
            lastErrorTime?: string
        }
    }>
}

@Injectable()
export class MetricsService {
    private redis: IORedis
    private gatherQueue: Queue
    private tradeBuyQueue: Queue
    private tradeSellQueue: Queue
    private distributeQueue: Queue
    private fundsGatherQueue: Queue

    constructor(private readonly supabase: SupabaseService) {
        this.redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379')

        // Initialize queues
        this.gatherQueue = new Queue('gather', { connection: this.redis })
        this.tradeBuyQueue = new Queue('trade.buy', { connection: this.redis })
        this.tradeSellQueue = new Queue('trade.sell', { connection: this.redis })
        this.distributeQueue = new Queue('distribute', { connection: this.redis })
        this.fundsGatherQueue = new Queue('funds.gather', { connection: this.redis })
    }

    async getSystemMetrics(): Promise<SystemMetrics> {
        const timestamp = new Date().toISOString()

        // System metrics
        const uptime = process.uptime()
        const cpuUsage = await this.getCPUUsage()
        const memoryUsage = process.memoryUsage()
        const totalMemory = os.totalmem()
        const usedMemory = totalMemory - os.freemem()

        // Redis metrics
        const redisInfo = await this.getRedisInfo()

        // Database metrics (placeholder - implement based on your connection pool)
        const dbMetrics = {
            connected: true,
            activeConnections: 0,
            idleConnections: 0,
            totalConnections: 0,
        }

        // API metrics (placeholder - implement with actual metrics collection)
        const apiMetrics = {
            totalRequests: 0,
            errorRate: 0,
            avgResponseTime: 0,
            p95ResponseTime: 0,
            p99ResponseTime: 0,
        }

        // Worker metrics from jobs in last 24h
        const workerMetrics = await this.getWorkerMetrics()

        return {
            timestamp,
            system: {
                uptime,
                cpu: {
                    usage: cpuUsage,
                    cores: os.cpus().length,
                },
                memory: {
                    used: usedMemory,
                    total: totalMemory,
                    percentage: (usedMemory / totalMemory) * 100,
                },
                redis: redisInfo,
                database: dbMetrics,
            },
            api: apiMetrics,
            workers: workerMetrics,
        }
    }

    async getQueueMetrics(timeRange: string = '24h'): Promise<QueueMetrics> {
        const timestamp = new Date().toISOString()
        const queues = [
            { name: 'gather', queue: this.gatherQueue },
            { name: 'trade.buy', queue: this.tradeBuyQueue },
            { name: 'trade.sell', queue: this.tradeSellQueue },
            { name: 'distribute', queue: this.distributeQueue },
            { name: 'funds.gather', queue: this.fundsGatherQueue },
        ]

        const queueMetrics: QueueMetrics['queues'] = {}

        for (const { name, queue } of queues) {
            const [waiting, active, delayed, completed, failed, isPaused] = await Promise.all([
                queue.getWaitingCount(),
                queue.getActiveCount(),
                queue.getDelayedCount(),
                queue.getCompletedCount(),
                queue.getFailedCount(),
                queue.isPaused(),
            ])

            // Calculate metrics based on completed/failed jobs
            const totalProcessed = completed + failed
            const errorRate = totalProcessed > 0 ? (failed / totalProcessed) * 100 : 0

            // Throughput: jobs per minute (estimate based on 24h window)
            const timeRangeMs = this.parseTimeRange(timeRange)
            const throughput = totalProcessed / (timeRangeMs / 60000)

            queueMetrics[name] = {
                name,
                waiting,
                active,
                completed,
                failed,
                delayed,
                paused: isPaused,
                metrics: {
                    throughput,
                    avgWaitTime: 0, // Would need to track this separately
                    avgProcessingTime: 0, // Would need to track this separately
                    errorRate,
                },
            }
        }

        return {
            timestamp,
            queues: queueMetrics,
        }
    }

    async getRPCMetrics(): Promise<RPCMetrics> {
        const timestamp = new Date().toISOString()

        // Placeholder - implement based on your RPC provider setup
        // This would track metrics for each configured RPC endpoint
        const providers = [
            {
                name: 'primary',
                url: this.sanitizeUrl(process.env.SOLANA_RPC_URL || ''),
                status: 'healthy' as const,
                metrics: {
                    totalRequests: 0,
                    successRate: 100,
                    avgLatency: 0,
                    p95Latency: 0,
                    errorRate: 0,
                },
            },
        ]

        return {
            timestamp,
            providers,
        }
    }

    private async getCPUUsage(): Promise<number> {
        // Get CPU usage percentage
        const cpus = os.cpus()
        let totalIdle = 0
        let totalTick = 0

        for (const cpu of cpus) {
            for (const type in cpu.times) {
                totalTick += cpu.times[type as keyof typeof cpu.times]
            }
            totalIdle += cpu.times.idle
        }

        const idle = totalIdle / cpus.length
        const total = totalTick / cpus.length
        const usage = 100 - (100 * idle) / total

        return Math.round(usage * 100) / 100
    }

    private async getRedisInfo(): Promise<SystemMetrics['system']['redis']> {
        try {
            const info = await this.redis.info('memory')
            const stats = await this.redis.info('clients')

            // Parse memory info
            const memoryUsedMatch = info.match(/used_memory:(\d+)/)
            const memoryPeakMatch = info.match(/used_memory_peak:(\d+)/)
            const connectedClientsMatch = stats.match(/connected_clients:(\d+)/)

            return {
                connected: true,
                memoryUsed: memoryUsedMatch ? parseInt(memoryUsedMatch[1]) : 0,
                memoryPeak: memoryPeakMatch ? parseInt(memoryPeakMatch[1]) : 0,
                connectedClients: connectedClientsMatch ? parseInt(connectedClientsMatch[1]) : 0,
            }
        } catch (error) {
            return {
                connected: false,
                memoryUsed: 0,
                memoryPeak: 0,
                connectedClients: 0,
            }
        }
    }

    private async getWorkerMetrics(): Promise<SystemMetrics['workers']> {
        // Get all queues
        const queues = [this.gatherQueue, this.tradeBuyQueue, this.tradeSellQueue, this.distributeQueue, this.fundsGatherQueue]

        let totalActive = 0
        let totalCompleted = 0
        let totalFailed = 0

        for (const queue of queues) {
            const [active, completed, failed] = await Promise.all([
                queue.getActiveCount(),
                queue.getCompletedCount(),
                queue.getFailedCount(),
            ])

            totalActive += active
            totalCompleted += completed
            totalFailed += failed
        }

        return {
            active: totalActive,
            completed: totalCompleted,
            failed: totalFailed,
            avgProcessingTime: 0, // Would need to track this separately
        }
    }

    private parseTimeRange(timeRange: string): number {
        const rangeMap: { [key: string]: number } = {
            '1h': 60 * 60 * 1000,
            '6h': 6 * 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
        }

        return rangeMap[timeRange] || rangeMap['24h']
    }

    private sanitizeUrl(url: string): string {
        try {
            const parsed = new URL(url)
            // Remove sensitive query parameters or credentials
            return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
        } catch {
            return 'invalid-url'
        }
    }
}
