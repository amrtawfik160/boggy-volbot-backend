import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import Redis from 'ioredis'

/**
 * Redis cache service for pool and token information
 * Provides caching with configurable TTL and automatic serialization
 */
@Injectable()
export class RedisCacheService implements OnApplicationShutdown {
    private redis: Redis

    // Default TTL values (in seconds)
    private readonly DEFAULT_TTL = 300 // 5 minutes
    private readonly POOL_TTL = 600 // 10 minutes
    private readonly TOKEN_TTL = 3600 // 1 hour

    constructor() {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
        this.redis = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy: (times: number) => {
                const delay = Math.min(times * 50, 2000)
                return delay
            },
            enableReadyCheck: true,
            lazyConnect: false,
        })

        this.redis.on('error', (error) => {
            console.error('Redis connection error:', error)
        })

        this.redis.on('connect', () => {
            console.log('Redis cache connected successfully')
        })
    }

    /**
     * Get a value from cache
     * @param key Cache key
     * @returns Cached value or null if not found/expired
     */
    async get<T>(key: string): Promise<T | null> {
        try {
            const value = await this.redis.get(key)
            if (!value) return null

            return JSON.parse(value) as T
        } catch (error) {
            console.error(`Cache GET error for key ${key}:`, error)
            return null
        }
    }

    /**
     * Set a value in cache with TTL
     * @param key Cache key
     * @param value Value to cache
     * @param ttl Time to live in seconds (optional)
     */
    async set(key: string, value: any, ttl?: number): Promise<void> {
        try {
            const serialized = JSON.stringify(value)
            const cacheTtl = ttl || this.DEFAULT_TTL

            await this.redis.setex(key, cacheTtl, serialized)
        } catch (error) {
            console.error(`Cache SET error for key ${key}:`, error)
        }
    }

    /**
     * Delete a value from cache
     * @param key Cache key
     */
    async del(key: string): Promise<void> {
        try {
            await this.redis.del(key)
        } catch (error) {
            console.error(`Cache DEL error for key ${key}:`, error)
        }
    }

    /**
     * Delete multiple keys matching a pattern
     * @param pattern Key pattern (e.g., "pool:*")
     */
    async delPattern(pattern: string): Promise<void> {
        try {
            const keys = await this.redis.keys(pattern)
            if (keys.length > 0) {
                await this.redis.del(...keys)
            }
        } catch (error) {
            console.error(`Cache DEL pattern error for ${pattern}:`, error)
        }
    }

    /**
     * Check if a key exists in cache
     * @param key Cache key
     * @returns true if key exists
     */
    async exists(key: string): Promise<boolean> {
        try {
            const result = await this.redis.exists(key)
            return result === 1
        } catch (error) {
            console.error(`Cache EXISTS error for key ${key}:`, error)
            return false
        }
    }

    /**
     * Get remaining TTL for a key
     * @param key Cache key
     * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
     */
    async ttl(key: string): Promise<number> {
        try {
            return await this.redis.ttl(key)
        } catch (error) {
            console.error(`Cache TTL error for key ${key}:`, error)
            return -2
        }
    }

    // ========== Specialized Cache Methods ==========

    /**
     * Cache pool information
     * @param poolId Pool ID
     * @param poolData Pool data to cache
     */
    async cachePool(poolId: string, poolData: any): Promise<void> {
        await this.set(`pool:${poolId}`, poolData, this.POOL_TTL)
    }

    /**
     * Get cached pool information
     * @param poolId Pool ID
     * @returns Cached pool data or null
     */
    async getCachedPool<T>(poolId: string): Promise<T | null> {
        return this.get<T>(`pool:${poolId}`)
    }

    /**
     * Cache pools by token ID
     * @param tokenId Token ID
     * @param pools Array of pools
     */
    async cachePoolsByToken(tokenId: string, pools: any[]): Promise<void> {
        await this.set(`pools:token:${tokenId}`, pools, this.POOL_TTL)
    }

    /**
     * Get cached pools by token ID
     * @param tokenId Token ID
     * @returns Cached pools or null
     */
    async getCachedPoolsByToken<T>(tokenId: string): Promise<T[] | null> {
        return this.get<T[]>(`pools:token:${tokenId}`)
    }

    /**
     * Cache token information
     * @param tokenId Token ID
     * @param tokenData Token data to cache
     */
    async cacheToken(tokenId: string, tokenData: any): Promise<void> {
        await this.set(`token:${tokenId}`, tokenData, this.TOKEN_TTL)
    }

    /**
     * Get cached token information
     * @param tokenId Token ID
     * @returns Cached token data or null
     */
    async getCachedToken<T>(tokenId: string): Promise<T | null> {
        return this.get<T>(`token:${tokenId}`)
    }

    /**
     * Cache token by mint address
     * @param mint Mint address
     * @param tokenData Token data to cache
     */
    async cacheTokenByMint(mint: string, tokenData: any): Promise<void> {
        await this.set(`token:mint:${mint}`, tokenData, this.TOKEN_TTL)
    }

    /**
     * Get cached token by mint address
     * @param mint Mint address
     * @returns Cached token data or null
     */
    async getCachedTokenByMint<T>(mint: string): Promise<T | null> {
        return this.get<T>(`token:mint:${mint}`)
    }

    /**
     * Cache all tokens list
     * @param tokens Array of tokens
     */
    async cacheAllTokens(tokens: any[]): Promise<void> {
        await this.set('tokens:all', tokens, this.TOKEN_TTL)
    }

    /**
     * Get cached all tokens list
     * @returns Cached tokens array or null
     */
    async getCachedAllTokens<T>(): Promise<T[] | null> {
        return this.get<T[]>('tokens:all')
    }

    /**
     * Invalidate pool cache
     * @param poolId Pool ID (optional, if not provided invalidates all pools)
     */
    async invalidatePoolCache(poolId?: string): Promise<void> {
        if (poolId) {
            await this.del(`pool:${poolId}`)
        } else {
            await this.delPattern('pool:*')
        }
    }

    /**
     * Invalidate token cache
     * @param tokenId Token ID (optional, if not provided invalidates all tokens)
     */
    async invalidateTokenCache(tokenId?: string): Promise<void> {
        if (tokenId) {
            await this.del(`token:${tokenId}`)
            await this.delPattern(`pools:token:${tokenId}`)
        } else {
            await this.delPattern('token:*')
            await this.delPattern('tokens:*')
            await this.delPattern('pools:token:*')
        }
    }

    /**
     * Get cache statistics
     * @returns Cache statistics
     */
    async getStats(): Promise<{
        connected: boolean
        keysCount: number
        memory: string
        hits: number
        misses: number
    }> {
        try {
            const info = await this.redis.info('stats')
            const memory = await this.redis.info('memory')

            // Parse stats
            const hitsMatch = info.match(/keyspace_hits:(\d+)/)
            const missesMatch = info.match(/keyspace_misses:(\d+)/)
            const memoryMatch = memory.match(/used_memory_human:([^\r\n]+)/)

            const dbSize = await this.redis.dbsize()

            return {
                connected: this.redis.status === 'ready',
                keysCount: dbSize,
                memory: memoryMatch ? memoryMatch[1] : 'unknown',
                hits: hitsMatch ? parseInt(hitsMatch[1]) : 0,
                misses: missesMatch ? parseInt(missesMatch[1]) : 0,
            }
        } catch (error) {
            console.error('Error getting cache stats:', error)
            return {
                connected: false,
                keysCount: 0,
                memory: 'unknown',
                hits: 0,
                misses: 0,
            }
        }
    }

    async onApplicationShutdown() {
        await this.redis.quit()
    }
}
