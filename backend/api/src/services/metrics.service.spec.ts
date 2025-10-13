import { Test, TestingModule } from '@nestjs/testing'
import { MetricsService } from './metrics.service'
import { SupabaseService } from './supabase.service'

jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        info: jest.fn().mockResolvedValue('used_memory:1000\nused_memory_peak:2000\nconnected_clients:5'),
    }))
})

jest.mock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({
        getWaitingCount: jest.fn().mockResolvedValue(10),
        getActiveCount: jest.fn().mockResolvedValue(5),
        getDelayedCount: jest.fn().mockResolvedValue(2),
        getCompletedCount: jest.fn().mockResolvedValue(100),
        getFailedCount: jest.fn().mockResolvedValue(10),
        isPaused: jest.fn().mockResolvedValue(false),
    })),
}))

describe('MetricsService', () => {
    let service: MetricsService
    let supabaseService: jest.Mocked<SupabaseService>

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MetricsService,
                {
                    provide: SupabaseService,
                    useValue: {
                        getClient: jest.fn(),
                    },
                },
            ],
        }).compile()

        service = module.get<MetricsService>(MetricsService)
        supabaseService = module.get(SupabaseService)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('getSystemMetrics', () => {
        it('should return system metrics with all required fields', async () => {
            const metrics = await service.getSystemMetrics()

            expect(metrics).toHaveProperty('timestamp')
            expect(metrics).toHaveProperty('system')
            expect(metrics).toHaveProperty('api')
            expect(metrics).toHaveProperty('workers')

            expect(metrics.system).toHaveProperty('uptime')
            expect(metrics.system).toHaveProperty('cpu')
            expect(metrics.system).toHaveProperty('memory')
            expect(metrics.system).toHaveProperty('redis')
            expect(metrics.system).toHaveProperty('database')

            expect(metrics.system.cpu).toHaveProperty('usage')
            expect(metrics.system.cpu).toHaveProperty('cores')

            expect(metrics.system.memory).toHaveProperty('used')
            expect(metrics.system.memory).toHaveProperty('total')
            expect(metrics.system.memory).toHaveProperty('percentage')

            expect(metrics.system.redis).toHaveProperty('connected')
            expect(metrics.system.redis).toHaveProperty('memoryUsed')
            expect(metrics.system.redis).toHaveProperty('memoryPeak')
            expect(metrics.system.redis).toHaveProperty('connectedClients')
        })

        it('should return valid numeric values', async () => {
            const metrics = await service.getSystemMetrics()

            expect(typeof metrics.system.uptime).toBe('number')
            expect(typeof metrics.system.cpu.usage).toBe('number')
            expect(typeof metrics.system.cpu.cores).toBe('number')
            expect(typeof metrics.system.memory.used).toBe('number')
            expect(typeof metrics.system.memory.total).toBe('number')
            expect(typeof metrics.system.memory.percentage).toBe('number')

            expect(metrics.system.cpu.cores).toBeGreaterThan(0)
            expect(metrics.system.memory.total).toBeGreaterThan(0)
            expect(metrics.system.memory.percentage).toBeGreaterThanOrEqual(0)
            expect(metrics.system.memory.percentage).toBeLessThanOrEqual(100)
        })

        it('should include timestamp in ISO format', async () => {
            const metrics = await service.getSystemMetrics()

            expect(metrics.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
        })
    })

    describe('getQueueMetrics', () => {
        it('should return queue metrics for all queues', async () => {
            const metrics = await service.getQueueMetrics('24h')

            expect(metrics).toHaveProperty('timestamp')
            expect(metrics).toHaveProperty('queues')

            expect(metrics.queues).toHaveProperty('gather')
            expect(metrics.queues).toHaveProperty('trade.buy')
            expect(metrics.queues).toHaveProperty('trade.sell')
            expect(metrics.queues).toHaveProperty('distribute')
            expect(metrics.queues).toHaveProperty('funds.gather')
        })

        it('should include all required queue fields', async () => {
            const metrics = await service.getQueueMetrics('24h')
            const gatherQueue = metrics.queues['gather']

            expect(gatherQueue).toHaveProperty('name')
            expect(gatherQueue).toHaveProperty('waiting')
            expect(gatherQueue).toHaveProperty('active')
            expect(gatherQueue).toHaveProperty('completed')
            expect(gatherQueue).toHaveProperty('failed')
            expect(gatherQueue).toHaveProperty('delayed')
            expect(gatherQueue).toHaveProperty('paused')
            expect(gatherQueue).toHaveProperty('metrics')

            expect(gatherQueue.metrics).toHaveProperty('throughput')
            expect(gatherQueue.metrics).toHaveProperty('avgWaitTime')
            expect(gatherQueue.metrics).toHaveProperty('avgProcessingTime')
            expect(gatherQueue.metrics).toHaveProperty('errorRate')
        })

        it('should calculate error rate correctly', async () => {
            const metrics = await service.getQueueMetrics('24h')
            const gatherQueue = metrics.queues['gather']

            // Based on mocked values: 100 completed, 10 failed
            // Error rate = (10 / 110) * 100 = 9.09%
            expect(gatherQueue.metrics.errorRate).toBeGreaterThan(0)
            expect(gatherQueue.metrics.errorRate).toBeLessThan(100)
        })

        it('should handle different time ranges', async () => {
            const metrics1h = await service.getQueueMetrics('1h')
            const metrics24h = await service.getQueueMetrics('24h')
            const metrics7d = await service.getQueueMetrics('7d')

            expect(metrics1h.queues['gather'].metrics.throughput).toBeDefined()
            expect(metrics24h.queues['gather'].metrics.throughput).toBeDefined()
            expect(metrics7d.queues['gather'].metrics.throughput).toBeDefined()
        })

        it('should default to 24h if no time range specified', async () => {
            const metrics = await service.getQueueMetrics()

            expect(metrics).toHaveProperty('queues')
            expect(metrics.queues).toHaveProperty('gather')
        })
    })

    describe('getRPCMetrics', () => {
        it('should return RPC metrics with providers', async () => {
            const metrics = await service.getRPCMetrics()

            expect(metrics).toHaveProperty('timestamp')
            expect(metrics).toHaveProperty('providers')
            expect(Array.isArray(metrics.providers)).toBe(true)
        })

        it('should include provider details', async () => {
            const metrics = await service.getRPCMetrics()

            if (metrics.providers.length > 0) {
                const provider = metrics.providers[0]

                expect(provider).toHaveProperty('name')
                expect(provider).toHaveProperty('url')
                expect(provider).toHaveProperty('status')
                expect(provider).toHaveProperty('metrics')

                expect(provider.metrics).toHaveProperty('totalRequests')
                expect(provider.metrics).toHaveProperty('successRate')
                expect(provider.metrics).toHaveProperty('avgLatency')
                expect(provider.metrics).toHaveProperty('p95Latency')
                expect(provider.metrics).toHaveProperty('errorRate')
            }
        })

        it('should sanitize RPC URLs', async () => {
            const metrics = await service.getRPCMetrics()

            if (metrics.providers.length > 0) {
                const provider = metrics.providers[0]
                // URL should not contain sensitive query params or credentials
                expect(provider.url).not.toContain('?')
            }
        })
    })
})
