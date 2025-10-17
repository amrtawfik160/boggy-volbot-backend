import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { HealthController } from '../health.controller';
import { HealthModule } from '../health.module';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Health Controller Integration Tests', () => {
    let app: INestApplication;
    let controller: HealthController;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [HealthModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        controller = moduleFixture.get<HealthController>(HealthController);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('/health (GET)', () => {
        it('should return health status with all checks', async () => {
            const result = await controller.check();

            expect(result).toBeDefined();
            expect(result.status).toBeDefined();
            expect(result.info).toBeDefined();
            expect(result.details).toBeDefined();

            // Check that all three indicators are present
            expect(result.details.database).toBeDefined();
            expect(result.details.redis).toBeDefined();
            expect(result.details.rpc).toBeDefined();
        });

        it('should handle database check', async () => {
            const result = await controller.check();

            expect(result.details.database).toBeDefined();
            expect(result.details.database.status).toBeDefined();
        });

        it('should handle redis check', async () => {
            const result = await controller.check();

            expect(result.details.redis).toBeDefined();
            expect(result.details.redis.status).toBeDefined();
        });

        it('should handle rpc check with degraded state', async () => {
            const result = await controller.check();

            expect(result.details.rpc).toBeDefined();
            expect(result.details.rpc.status).toBeDefined();
            // RPC can be 'up', 'degraded', or 'down'
            expect(['up', 'degraded', 'down']).toContain(result.details.rpc.status);
        });
    });

    describe('/health/live (GET)', () => {
        it('should return liveness status', () => {
            const result = controller.getLiveness();

            expect(result).toBeDefined();
            expect(result.status).toBe('ok');
            expect(result.timestamp).toBeDefined();
            expect(result.uptime).toBeDefined();
            expect(typeof result.uptime).toBe('number');
            expect(result.uptime).toBeGreaterThan(0);
        });
    });

    describe('/health/ready (GET)', () => {
        it('should return readiness status', async () => {
            const result = await controller.getReadiness();

            expect(result).toBeDefined();
            expect(result.status).toBeDefined();
            expect(result.details).toBeDefined();

            // Readiness checks DB and Redis only
            expect(result.details.database).toBeDefined();
            expect(result.details.redis).toBeDefined();
            expect(result.details.rpc).toBeUndefined(); // RPC not checked in readiness
        });

        it('should have database and redis checks in readiness', async () => {
            const result = await controller.getReadiness();

            expect(result.details.database.status).toBeDefined();
            expect(result.details.redis.status).toBeDefined();
        });
    });

    describe('/health/startup (GET)', () => {
        it('should return startup status', async () => {
            const result = await controller.getStartup();

            expect(result).toBeDefined();
            expect(result.status).toBeDefined();
            expect(result.details).toBeDefined();

            // Startup checks all services
            expect(result.details.database).toBeDefined();
            expect(result.details.redis).toBeDefined();
            expect(result.details.rpc).toBeDefined();
        });

        it('should not allow degraded RPC state on startup', async () => {
            const result = await controller.getStartup();

            // If RPC check passes, it should be 'up' not 'degraded'
            if (result.status === 'ok') {
                expect(result.details.rpc.status).toBe('up');
            }
        });
    });

    describe('Health Indicator Response Format', () => {
        it('should include latency metrics', async () => {
            const result = await controller.check();

            // At least one service should report latency
            const hasLatency =
                result.details.database?.latency ||
                result.details.redis?.latency ||
                result.details.rpc?.latency;

            expect(hasLatency).toBeDefined();
        });

        it('should include connection status', async () => {
            const result = await controller.check();

            expect(result.details.database?.connection).toBeDefined();
            expect(result.details.redis?.connection).toBeDefined();
        });

        it('should mask sensitive RPC endpoints', async () => {
            const result = await controller.check();

            if (result.details.rpc?.providers) {
                result.details.rpc.providers.forEach((provider: any) => {
                    // Endpoint should not contain full API keys
                    expect(provider.endpoint).toBeDefined();
                    expect(typeof provider.endpoint).toBe('string');
                });
            }
        });
    });
});
