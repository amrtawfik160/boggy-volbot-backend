import { ThrottlerStorage } from '@nestjs/throttler'
import { getRedisClient } from '../config/redis.config'
import type Redis from 'ioredis'

/**
 * Custom Redis storage implementation for @nestjs/throttler
 * Uses shared Redis connection pool for optimal performance
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
    private redis: Redis

    constructor() {
        this.redis = getRedisClient()
    }

    async increment(key: string, ttl: number): Promise<{ totalHits: number; timeToExpire: number }> {
        const redisKey = `throttle:${key}`

        // Increment the counter
        const totalHits = await this.redis.incr(redisKey)

        // If this is the first hit, set the TTL
        if (totalHits === 1) {
            await this.redis.expire(redisKey, ttl)
        }

        // Get remaining TTL
        const timeToExpire = await this.redis.ttl(redisKey)

        return {
            totalHits,
            timeToExpire: timeToExpire > 0 ? timeToExpire : 0,
        }
    }

    async onApplicationShutdown() {
        // Don't close the shared connection here
        // It will be closed by the application shutdown hook
    }
}
