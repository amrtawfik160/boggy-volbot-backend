import Redis from 'ioredis'

/**
 * Redis connection pool configuration
 * ioredis automatically handles connection pooling internally
 */
export interface RedisPoolConfig {
    /**
     * Maximum number of connections in the pool
     * Default: 10
     */
    maxRetriesPerRequest?: number

    /**
     * Enable automatic reconnection on connection loss
     * Default: true
     */
    enableAutoPipelining?: boolean

    /**
     * Enable ready check before using the connection
     * Default: true
     */
    enableReadyCheck?: boolean

    /**
     * Lazy connect - don't connect until first command
     * Default: false
     */
    lazyConnect?: boolean

    /**
     * Retry strategy for failed connections
     */
    retryStrategy?: (times: number) => number | void | null

    /**
     * Connection timeout in milliseconds
     * Default: 10000 (10 seconds)
     */
    connectTimeout?: number

    /**
     * Keep alive interval in milliseconds
     * Default: 0 (disabled)
     */
    keepAlive?: number
}

/**
 * Optimized Redis connection pool configuration for production
 */
export const REDIS_POOL_CONFIG: RedisPoolConfig = {
    maxRetriesPerRequest: 3,
    enableAutoPipelining: true,
    enableReadyCheck: true,
    lazyConnect: true, // Don't connect until first command
    connectTimeout: 10000,
    keepAlive: 30000, // 30 seconds
    retryStrategy: (times: number) => {
        // Exponential backoff with max 3 seconds
        const delay = Math.min(times * 100, 3000)
        return delay
    },
}

/**
 * Singleton Redis client instance
 * Reuse this instance across the application to leverage connection pooling
 */
let redisClient: Redis | null = null

/**
 * Get or create the shared Redis client instance
 * This ensures all parts of the application use the same connection pool
 */
export function getRedisClient(): Redis {
    if (!redisClient) {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

        redisClient = new Redis(redisUrl, REDIS_POOL_CONFIG)

        // Log connection events
        redisClient.on('connect', () => {
            console.log('Redis client connected')
        })

        redisClient.on('ready', () => {
            console.log('Redis client ready')
        })

        redisClient.on('error', (error) => {
            console.error('Redis client error:', error)
        })

        redisClient.on('close', () => {
            console.log('Redis client connection closed')
        })

        redisClient.on('reconnecting', () => {
            console.log('Redis client reconnecting')
        })

        redisClient.on('end', () => {
            console.log('Redis client connection ended')
            redisClient = null
        })
    }

    return redisClient
}

/**
 * Create a new Redis client for specific use cases (e.g., BullMQ queues)
 * Use this when you need isolation from the main connection pool
 */
export function createRedisClient(config?: RedisPoolConfig): Redis {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    return new Redis(redisUrl, { ...REDIS_POOL_CONFIG, ...config })
}

/**
 * Close the Redis client connection gracefully
 * Should be called on application shutdown
 */
export async function closeRedisClient(): Promise<void> {
    if (redisClient) {
        await redisClient.quit()
        redisClient = null
    }
}

/**
 * Get Redis connection pool statistics
 */
export async function getRedisPoolStats(): Promise<{
    connected: boolean
    status: string
    commandQueueLength: number
    offlineQueueLength: number
}> {
    const client = getRedisClient()

    return {
        connected: client.status === 'ready',
        status: client.status,
        commandQueueLength: client.commandQueue.length,
        offlineQueueLength: client.offlineQueue.length,
    }
}
