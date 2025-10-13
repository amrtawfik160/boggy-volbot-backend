import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { RedisHealthIndicator } from './indicators/redis.health';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RpcHealthIndicator } from './indicators/rpc.health';

/**
 * Health check controller
 * Provides health, liveness, and readiness endpoints for monitoring and Kubernetes
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private redisHealth: RedisHealthIndicator,
        private databaseHealth: DatabaseHealthIndicator,
        private rpcHealth: RpcHealthIndicator,
    ) {}

    /**
     * Comprehensive health check
     * Returns status of all critical services (DB, Redis, RPC)
     * Used for general monitoring and dashboards
     */
    @Get()
    @HealthCheck()
    @ApiOperation({
        summary: 'Check overall application health',
        description: 'Returns the health status of database, Redis, and RPC providers. RPC degradation is acceptable.',
    })
    @ApiResponse({
        status: 200,
        description: 'Service is healthy or degraded but operational',
    })
    @ApiResponse({
        status: 503,
        description: 'Service is unhealthy - critical services are down',
    })
    check() {
        return this.health.check([
            () => this.databaseHealth.isHealthy('database'),
            () => this.redisHealth.isHealthy('redis'),
            () => this.rpcHealth.isHealthy('rpc', true), // Allow degraded state
        ]);
    }

    /**
     * Liveness probe for Kubernetes
     * Indicates if the application is alive and should not be restarted
     * Only checks if the application process is running properly
     * Does NOT check external dependencies
     */
    @Get('live')
    @ApiOperation({
        summary: 'Kubernetes liveness probe',
        description: 'Indicates if the application is alive. Returns 200 if the process is running. Does not check external dependencies.',
    })
    @ApiResponse({
        status: 200,
        description: 'Application is alive',
    })
    getLiveness() {
        // Simple check - if this endpoint responds, the app is alive
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        };
    }

    /**
     * Readiness probe for Kubernetes
     * Indicates if the application is ready to accept traffic
     * Checks critical dependencies (DB, Redis)
     * RPC failures are tolerated (degraded state)
     */
    @Get('ready')
    @HealthCheck()
    @ApiOperation({
        summary: 'Kubernetes readiness probe',
        description: 'Indicates if the application is ready to accept traffic. Checks database and Redis. RPC degradation is acceptable.',
    })
    @ApiResponse({
        status: 200,
        description: 'Application is ready to accept traffic',
    })
    @ApiResponse({
        status: 503,
        description: 'Application is not ready - critical dependencies are unavailable',
    })
    getReadiness() {
        return this.health.check([
            () => this.databaseHealth.isHealthy('database'),
            () => this.redisHealth.isHealthy('redis'),
            // Note: RPC health is not checked in readiness
            // The queue can continue to operate even if RPC is temporarily down
        ]);
    }

    /**
     * Startup probe for Kubernetes
     * Indicates if the application has completed startup initialization
     * Checks all critical services are available
     */
    @Get('startup')
    @HealthCheck()
    @ApiOperation({
        summary: 'Kubernetes startup probe',
        description: 'Indicates if the application has completed startup. Checks all critical services including database, Redis, and RPC.',
    })
    @ApiResponse({
        status: 200,
        description: 'Application has started successfully',
    })
    @ApiResponse({
        status: 503,
        description: 'Application is still starting up or startup failed',
    })
    getStartup() {
        return this.health.check([
            () => this.databaseHealth.isHealthy('database'),
            () => this.redisHealth.isHealthy('redis'),
            () => this.rpcHealth.isHealthy('rpc', false), // Do not allow degraded on startup
        ]);
    }
}
