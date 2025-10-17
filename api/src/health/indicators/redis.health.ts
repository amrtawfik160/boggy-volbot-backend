import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import Redis from 'ioredis';

/**
 * Redis health indicator
 * Checks if Redis connection is available and responsive
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
    private redis: Redis;

    constructor() {
        super();
        this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            retryStrategy: () => null, // Don't retry on health check
        });
    }

    async isHealthy(key: string): Promise<HealthIndicatorResult> {
        try {
            // Ensure connection
            if (this.redis.status !== 'ready') {
                await this.redis.connect();
            }

            // Test Redis with PING command
            const startTime = Date.now();
            const response = await this.redis.ping();
            const latency = Date.now() - startTime;

            if (response !== 'PONG') {
                throw new Error('Redis ping failed');
            }

            // Get additional info
            const info = await this.redis.info('server');
            const match = info.match(/redis_version:([^\r\n]+)/);
            const version = match ? match[1] : 'unknown';

            const result = this.getStatus(key, true, {
                status: 'up',
                latency: `${latency}ms`,
                version,
                connection: this.redis.status,
            });

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const result = this.getStatus(key, false, {
                status: 'down',
                message: errorMessage,
                connection: this.redis.status,
            });

            throw new HealthCheckError('Redis check failed', result);
        }
    }

    async onApplicationShutdown() {
        await this.redis.quit();
    }
}
