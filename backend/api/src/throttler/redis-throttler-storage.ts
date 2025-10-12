import { ThrottlerStorage } from '@nestjs/throttler'
import Redis from 'ioredis'

/**
 * Custom Redis storage implementation for @nestjs/throttler
 * Uses ioredis to track rate limit records with automatic expiration
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
    private redis: Redis

    constructor(redisUrl?: string) {
        this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379')
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
        await this.redis.quit()
    }
}
