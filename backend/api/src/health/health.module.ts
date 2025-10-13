import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './indicators/redis.health';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RpcHealthIndicator } from './indicators/rpc.health';

/**
 * Health check module
 * Provides comprehensive health monitoring for all critical services
 */
@Module({
    imports: [TerminusModule],
    controllers: [HealthController],
    providers: [
        RedisHealthIndicator,
        DatabaseHealthIndicator,
        RpcHealthIndicator,
    ],
})
export class HealthModule {}
