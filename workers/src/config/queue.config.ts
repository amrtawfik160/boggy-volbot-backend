/**
 * BullMQ Queue Configuration
 * Centralized configuration for queue concurrency, priorities, and performance tuning
 */

export interface QueueConfig {
    concurrency: number
    priority?: {
        min: number
        max: number
    }
    limiter?: {
        max: number // Max jobs to process per duration
        duration: number // Duration in milliseconds
    }
    rateLimit?: {
        max: number // Max jobs per window
        duration: number // Window duration in milliseconds
    }
}

/**
 * Default queue configurations optimized for different workload types
 */
export const QUEUE_CONFIGS: Record<string, QueueConfig> = {
    // Gather worker: High concurrency, low priority (data collection)
    'gather': {
        concurrency: 10, // Increased from 5
        priority: { min: 1, max: 5 }, // Lower priority
        limiter: {
            max: 100, // Max 100 jobs per minute
            duration: 60000,
        },
    },

    // Trade Buy worker: Moderate concurrency, high priority (critical trading)
    'trade.buy': {
        concurrency: 5, // Increased from 3
        priority: { min: 8, max: 10 }, // Highest priority
        limiter: {
            max: 50, // Max 50 trades per minute (rate limiting)
            duration: 60000,
        },
    },

    // Trade Sell worker: Moderate concurrency, high priority (critical trading)
    'trade.sell': {
        concurrency: 5, // Increased from 3
        priority: { min: 8, max: 10 }, // Highest priority
        limiter: {
            max: 50, // Max 50 trades per minute (rate limiting)
            duration: 60000,
        },
    },

    // Distribute worker: Low concurrency, medium priority (wallet distribution)
    'distribute': {
        concurrency: 3, // Increased from 2
        priority: { min: 6, max: 7 }, // Medium-high priority
        limiter: {
            max: 20, // Max 20 distributions per minute
            duration: 60000,
        },
    },

    // Status worker: High concurrency, medium priority (status updates)
    'status': {
        concurrency: 10, // Increased from 5
        priority: { min: 4, max: 6 }, // Medium priority
        limiter: {
            max: 200, // Max 200 status checks per minute
            duration: 60000,
        },
    },

    // Webhook worker: Very high concurrency, low priority (notifications)
    'webhook': {
        concurrency: 20, // Increased from 10
        priority: { min: 2, max: 4 }, // Lower priority
        limiter: {
            max: 500, // Max 500 webhooks per minute
            duration: 60000,
        },
    },

    // Funds Gather worker: Very low concurrency, medium priority (fund collection)
    'funds.gather': {
        concurrency: 2, // Increased from 1
        priority: { min: 5, max: 7 }, // Medium priority
        limiter: {
            max: 10, // Max 10 fund gathers per minute
            duration: 60000,
        },
    },
}

/**
 * Job priority levels for manual priority assignment
 */
export enum JobPriority {
    CRITICAL = 10, // Critical jobs (trade execution, emergency stops)
    HIGH = 8, // High priority (buy/sell orders)
    MEDIUM_HIGH = 6, // Medium-high priority (distribute, funds gather)
    MEDIUM = 5, // Medium priority (status updates)
    LOW = 3, // Low priority (webhooks, notifications)
    LOWEST = 1, // Lowest priority (background tasks, gather)
}

/**
 * Get queue configuration with environment variable overrides
 */
export function getQueueConfig(queueName: string): QueueConfig {
    const defaultConfig = QUEUE_CONFIGS[queueName] || {
        concurrency: 5,
        priority: { min: 5, max: 5 },
    }

    // Allow environment variable overrides
    const envConcurrency = process.env[`${queueName.toUpperCase().replace('.', '_')}_CONCURRENCY`]
    if (envConcurrency) {
        defaultConfig.concurrency = parseInt(envConcurrency, 10)
    }

    return defaultConfig
}

/**
 * Performance tuning recommendations based on system resources
 */
export interface PerformanceTuning {
    totalConcurrency: number
    recommendedWorkerCount: number
    redisConnectionPool: number
    notes: string[]
}

/**
 * Calculate recommended performance settings based on available resources
 */
export function calculatePerformanceTuning(): PerformanceTuning {
    // Sum up total concurrency from all queues
    const totalConcurrency = Object.values(QUEUE_CONFIGS).reduce(
        (sum, config) => sum + config.concurrency,
        0
    )

    // Recommendations based on total concurrency
    const recommendedWorkerCount = Math.ceil(totalConcurrency / 20) // ~20 concurrent jobs per worker process
    const redisConnectionPool = totalConcurrency + 10 // Buffer for Redis connections

    const notes: string[] = []

    if (totalConcurrency > 50) {
        notes.push('High concurrency detected. Consider horizontal scaling with multiple worker processes.')
    }

    if (totalConcurrency > 100) {
        notes.push('Very high concurrency. Ensure Redis and Postgres can handle the load.')
        notes.push('Monitor memory usage and connection pool exhaustion.')
    }

    notes.push(`Current total concurrency: ${totalConcurrency} concurrent jobs`)
    notes.push(`Recommended worker instances: ${recommendedWorkerCount}`)
    notes.push(`Redis connection pool size: ${redisConnectionPool}`)

    return {
        totalConcurrency,
        recommendedWorkerCount,
        redisConnectionPool,
        notes,
    }
}

/**
 * Get job priority based on job type and context
 */
export function getJobPriority(jobType: string, context?: any): number {
    // Trade jobs always have highest priority
    if (jobType.includes('buy') || jobType.includes('sell')) {
        return JobPriority.CRITICAL
    }

    // Distribute and funds gather are medium-high
    if (jobType.includes('distribute') || jobType.includes('funds')) {
        return JobPriority.MEDIUM_HIGH
    }

    // Status updates are medium priority
    if (jobType.includes('status')) {
        return JobPriority.MEDIUM
    }

    // Webhooks are low priority
    if (jobType.includes('webhook')) {
        return JobPriority.LOW
    }

    // Gather jobs are lowest priority
    if (jobType.includes('gather')) {
        return JobPriority.LOWEST
    }

    // Default to medium priority
    return JobPriority.MEDIUM
}

/**
 * Environment variable configuration
 * Add these to your .env file to override defaults:
 *
 * GATHER_CONCURRENCY=10
 * TRADE_BUY_CONCURRENCY=5
 * TRADE_SELL_CONCURRENCY=5
 * DISTRIBUTE_CONCURRENCY=3
 * STATUS_CONCURRENCY=10
 * WEBHOOK_CONCURRENCY=20
 * FUNDS_GATHER_CONCURRENCY=2
 */
