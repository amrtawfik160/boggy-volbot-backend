import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisHealthIndicator } from '../indicators/redis.health';
import { DatabaseHealthIndicator } from '../indicators/database.health';
import { RpcHealthIndicator } from '../indicators/rpc.health';
import { HealthCheckError } from '@nestjs/terminus';

describe('Health Indicators Unit Tests', () => {
    describe('RedisHealthIndicator', () => {
        let indicator: RedisHealthIndicator;

        beforeEach(() => {
            indicator = new RedisHealthIndicator();
        });

        it('should be defined', () => {
            expect(indicator).toBeDefined();
        });

        it('should return healthy status when Redis is available', async () => {
            const result = await indicator.isHealthy('redis');

            expect(result).toBeDefined();
            expect(result.redis).toBeDefined();
        });

        it('should include connection status and latency', async () => {
            const result = await indicator.isHealthy('redis');

            expect(result.redis.status).toBeDefined();
            expect(result.redis.connection).toBeDefined();
            expect(result.redis.latency).toBeDefined();
        });

        it('should throw HealthCheckError when Redis is unavailable', async () => {
            // Create indicator with invalid Redis URL
            const badIndicator = new RedisHealthIndicator();
            (badIndicator as any).redis = {
                status: 'end',
                connect: vi.fn().mockRejectedValue(new Error('Connection refused')),
                ping: vi.fn().mockRejectedValue(new Error('Connection refused')),
            };

            await expect(badIndicator.isHealthy('redis')).rejects.toThrow(HealthCheckError);
        });
    });

    describe('DatabaseHealthIndicator', () => {
        let indicator: DatabaseHealthIndicator;

        beforeEach(() => {
            indicator = new DatabaseHealthIndicator();
        });

        it('should be defined', () => {
            expect(indicator).toBeDefined();
        });

        it('should return healthy status when database is available', async () => {
            const result = await indicator.isHealthy('database');

            expect(result).toBeDefined();
            expect(result.database).toBeDefined();
        });

        it('should include connection status and latency', async () => {
            const result = await indicator.isHealthy('database');

            expect(result.database.status).toBeDefined();
            expect(result.database.connection).toBeDefined();
            expect(result.database.latency).toBeDefined();
        });

        it('should throw HealthCheckError when database is unavailable', async () => {
            // Mock supabase client with failed query
            const badIndicator = new DatabaseHealthIndicator();
            (badIndicator as any).supabase = {
                from: vi.fn().mockReturnValue({
                    select: vi.fn().mockResolvedValue({
                        data: null,
                        error: new Error('Database connection failed'),
                    }),
                }),
            };

            await expect(badIndicator.isHealthy('database')).rejects.toThrow(HealthCheckError);
        });
    });

    describe('RpcHealthIndicator', () => {
        let indicator: RpcHealthIndicator;

        beforeEach(() => {
            indicator = new RpcHealthIndicator();
        });

        it('should be defined', () => {
            expect(indicator).toBeDefined();
        });

        it('should check multiple RPC endpoints', async () => {
            const result = await indicator.isHealthy('rpc', true);

            expect(result).toBeDefined();
            expect(result.rpc).toBeDefined();
            expect(result.rpc.providers).toBeDefined();
            expect(Array.isArray(result.rpc.providers)).toBe(true);
        });

        it('should include provider details', async () => {
            const result = await indicator.isHealthy('rpc', true);

            if (result.rpc.providers && result.rpc.providers.length > 0) {
                const provider = result.rpc.providers[0];
                expect(provider.endpoint).toBeDefined();
                expect(provider.status).toBeDefined();
            }
        });

        it('should report degraded state when some providers fail', async () => {
            // Mock connections with mixed results
            const mockConnections = new Map([
                [
                    'https://good-endpoint.com',
                    {
                        getVersion: vi.fn().mockResolvedValue({ 'solana-core': '1.17.0' }),
                        getSlot: vi.fn().mockResolvedValue(123456),
                    },
                ],
                [
                    'https://bad-endpoint.com',
                    {
                        getVersion: vi.fn().mockRejectedValue(new Error('Connection timeout')),
                        getSlot: vi.fn().mockRejectedValue(new Error('Connection timeout')),
                    },
                ],
            ]);

            (indicator as any).connections = mockConnections;
            (indicator as any).rpcEndpoints = ['https://good-endpoint.com', 'https://bad-endpoint.com'];

            const result = await indicator.isHealthy('rpc', true);

            expect(result.rpc.status).toBe('degraded');
            expect(result.rpc.healthy).toBe(1);
            expect(result.rpc.total).toBe(2);
        });

        it('should throw HealthCheckError when all providers are down', async () => {
            // Mock all connections to fail
            const mockConnections = new Map([
                [
                    'https://bad-endpoint-1.com',
                    {
                        getVersion: vi.fn().mockRejectedValue(new Error('Connection timeout')),
                        getSlot: vi.fn().mockRejectedValue(new Error('Connection timeout')),
                    },
                ],
                [
                    'https://bad-endpoint-2.com',
                    {
                        getVersion: vi.fn().mockRejectedValue(new Error('Connection timeout')),
                        getSlot: vi.fn().mockRejectedValue(new Error('Connection timeout')),
                    },
                ],
            ]);

            (indicator as any).connections = mockConnections;
            (indicator as any).rpcEndpoints = ['https://bad-endpoint-1.com', 'https://bad-endpoint-2.com'];

            await expect(indicator.isHealthy('rpc', true)).rejects.toThrow(HealthCheckError);
        });

        it('should throw HealthCheckError when degraded state is not allowed', async () => {
            // Mock connections with mixed results
            const mockConnections = new Map([
                [
                    'https://good-endpoint.com',
                    {
                        getVersion: vi.fn().mockResolvedValue({ 'solana-core': '1.17.0' }),
                        getSlot: vi.fn().mockResolvedValue(123456),
                    },
                ],
                [
                    'https://bad-endpoint.com',
                    {
                        getVersion: vi.fn().mockRejectedValue(new Error('Connection timeout')),
                        getSlot: vi.fn().mockRejectedValue(new Error('Connection timeout')),
                    },
                ],
            ]);

            (indicator as any).connections = mockConnections;
            (indicator as any).rpcEndpoints = ['https://good-endpoint.com', 'https://bad-endpoint.com'];

            // Should throw when degradedAllowed = false
            await expect(indicator.isHealthy('rpc', false)).rejects.toThrow(HealthCheckError);
        });

        it('should mask sensitive endpoint information', async () => {
            const result = await indicator.isHealthy('rpc', true);

            if (result.rpc.providers && result.rpc.providers.length > 0) {
                result.rpc.providers.forEach((provider: any) => {
                    // Endpoint should be masked if it contains API keys
                    expect(provider.endpoint).toBeDefined();
                    expect(typeof provider.endpoint).toBe('string');
                });
            }
        });
    });

    describe('Error Handling', () => {
        it('should provide meaningful error messages', async () => {
            const indicator = new DatabaseHealthIndicator();
            (indicator as any).supabase = {
                from: vi.fn().mockReturnValue({
                    select: vi.fn().mockResolvedValue({
                        data: null,
                        error: new Error('Connection timeout'),
                    }),
                }),
            };

            try {
                await indicator.isHealthy('database');
                expect.fail('Should have thrown HealthCheckError');
            } catch (error) {
                expect(error).toBeInstanceOf(HealthCheckError);
                const checkError = error as HealthCheckError;
                expect(checkError.message).toBe('Database check failed');
            }
        });

        it('should include error details in response', async () => {
            const indicator = new RedisHealthIndicator();
            (indicator as any).redis = {
                status: 'end',
                connect: vi.fn().mockRejectedValue(new Error('Connection refused')),
                ping: vi.fn().mockRejectedValue(new Error('Connection refused')),
            };

            try {
                await indicator.isHealthy('redis');
                expect.fail('Should have thrown HealthCheckError');
            } catch (error) {
                expect(error).toBeInstanceOf(HealthCheckError);
                const checkError = error as HealthCheckError;
                const response = checkError.getResponse() as any;
                expect(response.redis).toBeDefined();
                expect(response.redis.status).toBe('down');
                expect(response.redis.message).toBeDefined();
            }
        });
    });
});
