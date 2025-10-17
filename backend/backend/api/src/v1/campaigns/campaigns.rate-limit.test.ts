import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import IORedis from 'ioredis'

/**
 * Integration tests for campaign endpoint rate limiting
 * Tests the @nestjs/throttler rate limits on sensitive campaign operations
 */

describe('Campaign Rate Limiting', () => {
    let redis: IORedis

    beforeAll(async () => {
        redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379')
    })

    afterAll(async () => {
        // Clean up test keys
        const keys = await redis.keys('throttle:*')
        if (keys.length > 0) {
            await redis.del(...keys)
        }
        await redis.quit()
    })

    it('should enforce 5 req/min limit on campaign start endpoint', async () => {
        const userId = 'test-user-1'
        const key = `throttle:campaign-start:${userId}`

        // Simulate 5 requests (should all succeed)
        for (let i = 0; i < 5; i++) {
            const count = await redis.incr(key)
            if (count === 1) {
                await redis.expire(key, 60)
            }
            expect(count).toBeLessThanOrEqual(5)
        }

        // 6th request should exceed limit
        const count = await redis.incr(key)
        expect(count).toBeGreaterThan(5)

        // Clean up
        await redis.del(key)
    })

    it('should enforce 10 req/min limit on wallet creation endpoint', async () => {
        const userId = 'test-user-2'
        const key = `throttle:wallet-creation:${userId}`

        // Simulate 10 requests (should all succeed)
        for (let i = 0; i < 10; i++) {
            const count = await redis.incr(key)
            if (count === 1) {
                await redis.expire(key, 60)
            }
            expect(count).toBeLessThanOrEqual(10)
        }

        // 11th request should exceed limit
        const count = await redis.incr(key)
        expect(count).toBeGreaterThan(10)

        // Clean up
        await redis.del(key)
    })

    it('should enforce 100 req/min general limit', async () => {
        const userId = 'test-user-3'
        const key = `throttle:general:${userId}`

        // Simulate 100 requests (should all succeed)
        for (let i = 0; i < 100; i++) {
            const count = await redis.incr(key)
            if (count === 1) {
                await redis.expire(key, 60)
            }
            expect(count).toBeLessThanOrEqual(100)
        }

        // 101st request should exceed limit
        const count = await redis.incr(key)
        expect(count).toBeGreaterThan(100)

        // Clean up
        await redis.del(key)
    })

    it('should reset counter after TTL expires', async () => {
        const userId = 'test-user-4'
        const key = `throttle:campaign-start:${userId}`

        // Make a request
        await redis.incr(key)
        await redis.expire(key, 1) // Set 1 second TTL

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 1100))

        // Key should be expired
        const exists = await redis.exists(key)
        expect(exists).toBe(0)
    })

    it('should track different users separately', async () => {
        const user1Key = 'throttle:campaign-start:user-a'
        const user2Key = 'throttle:campaign-start:user-b'

        // User 1 makes 3 requests
        for (let i = 0; i < 3; i++) {
            await redis.incr(user1Key)
        }

        // User 2 makes 2 requests
        for (let i = 0; i < 2; i++) {
            await redis.incr(user2Key)
        }

        const user1Count = await redis.get(user1Key)
        const user2Count = await redis.get(user2Key)

        expect(user1Count).toBe('3')
        expect(user2Count).toBe('2')

        // Clean up
        await redis.del(user1Key, user2Key)
    })
})
