import { Test, TestingModule } from '@nestjs/testing'
import { AdminMetricsController } from './metrics.controller'
import { MetricsService } from '../../../services/metrics.service'
import { AdminGuard } from '../../../guards/admin.guard'
import { ExecutionContext } from '@nestjs/common'

describe('AdminMetricsController', () => {
    let controller: AdminMetricsController
    let metricsService: jest.Mocked<MetricsService>

    const mockSystemMetrics = {
        timestamp: '2025-10-13T00:00:00.000Z',
        system: {
            uptime: 3600,
            cpu: {
                usage: 45.5,
                cores: 8,
            },
            memory: {
                used: 8589934592,
                total: 17179869184,
                percentage: 50,
            },
            redis: {
                connected: true,
                memoryUsed: 1048576,
                memoryPeak: 2097152,
                connectedClients: 5,
            },
            database: {
                connected: true,
                activeConnections: 10,
                idleConnections: 5,
                totalConnections: 15,
            },
        },
        api: {
            totalRequests: 1000,
            errorRate: 0.5,
            avgResponseTime: 150,
            p95ResponseTime: 300,
            p99ResponseTime: 500,
        },
        workers: {
            active: 5,
            completed: 1000,
            failed: 10,
            avgProcessingTime: 200,
        },
    }

    const mockQueueMetrics = {
        timestamp: '2025-10-13T00:00:00.000Z',
        queues: {
            gather: {
                name: 'gather',
                waiting: 10,
                active: 2,
                completed: 100,
                failed: 5,
                delayed: 1,
                paused: false,
                metrics: {
                    throughput: 10.5,
                    avgWaitTime: 1000,
                    avgProcessingTime: 2000,
                    errorRate: 4.76,
                },
            },
            'trade.buy': {
                name: 'trade.buy',
                waiting: 15,
                active: 3,
                completed: 200,
                failed: 8,
                delayed: 2,
                paused: false,
                metrics: {
                    throughput: 15.2,
                    avgWaitTime: 800,
                    avgProcessingTime: 1500,
                    errorRate: 3.85,
                },
            },
        },
    }

    const mockRPCMetrics = {
        timestamp: '2025-10-13T00:00:00.000Z',
        providers: [
            {
                name: 'primary',
                url: 'https://api.mainnet-beta.solana.com',
                status: 'healthy' as const,
                metrics: {
                    totalRequests: 5000,
                    successRate: 99.5,
                    avgLatency: 100,
                    p95Latency: 200,
                    errorRate: 0.5,
                },
            },
        ],
    }

    beforeEach(async () => {
        const mockMetricsService = {
            getSystemMetrics: jest.fn().mockResolvedValue(mockSystemMetrics),
            getQueueMetrics: jest.fn().mockResolvedValue(mockQueueMetrics),
            getRPCMetrics: jest.fn().mockResolvedValue(mockRPCMetrics),
        }

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AdminMetricsController],
            providers: [
                {
                    provide: MetricsService,
                    useValue: mockMetricsService,
                },
            ],
        })
            .overrideGuard(AdminGuard)
            .useValue({
                canActivate: (context: ExecutionContext) => {
                    const request = context.switchToHttp().getRequest()
                    request.user = { id: 'admin-123', role: 'admin' }
                    return true
                },
            })
            .compile()

        controller = module.get<AdminMetricsController>(AdminMetricsController)
        metricsService = module.get(MetricsService)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('getSystemMetrics', () => {
        it('should return system metrics', async () => {
            const result = await controller.getSystemMetrics()

            expect(result).toEqual(mockSystemMetrics)
            expect(metricsService.getSystemMetrics).toHaveBeenCalledTimes(1)
        })

        it('should return metrics with correct structure', async () => {
            const result = await controller.getSystemMetrics()

            expect(result).toHaveProperty('timestamp')
            expect(result).toHaveProperty('system')
            expect(result).toHaveProperty('api')
            expect(result).toHaveProperty('workers')

            expect(result.system).toHaveProperty('uptime')
            expect(result.system).toHaveProperty('cpu')
            expect(result.system).toHaveProperty('memory')
            expect(result.system).toHaveProperty('redis')
            expect(result.system).toHaveProperty('database')
        })

        it('should return valid metric values', async () => {
            const result = await controller.getSystemMetrics()

            expect(result.system.cpu.usage).toBeGreaterThanOrEqual(0)
            expect(result.system.cpu.cores).toBeGreaterThan(0)
            expect(result.system.memory.percentage).toBeGreaterThanOrEqual(0)
            expect(result.system.memory.percentage).toBeLessThanOrEqual(100)
            expect(result.system.redis.connected).toBe(true)
            expect(result.system.database.connected).toBe(true)
        })
    })

    describe('getQueueMetrics', () => {
        it('should return queue metrics with default time range', async () => {
            const result = await controller.getQueueMetrics()

            expect(result).toEqual(mockQueueMetrics)
            expect(metricsService.getQueueMetrics).toHaveBeenCalledWith('24h')
        })

        it('should return queue metrics with specified time range', async () => {
            const result = await controller.getQueueMetrics('1h')

            expect(result).toEqual(mockQueueMetrics)
            expect(metricsService.getQueueMetrics).toHaveBeenCalledWith('1h')
        })

        it('should return metrics for all queues', async () => {
            const result = await controller.getQueueMetrics()

            expect(result.queues).toHaveProperty('gather')
            expect(result.queues).toHaveProperty('trade.buy')
        })

        it('should include queue statistics', async () => {
            const result = await controller.getQueueMetrics()
            const gatherQueue = result.queues['gather']

            expect(gatherQueue).toHaveProperty('waiting')
            expect(gatherQueue).toHaveProperty('active')
            expect(gatherQueue).toHaveProperty('completed')
            expect(gatherQueue).toHaveProperty('failed')
            expect(gatherQueue).toHaveProperty('delayed')
            expect(gatherQueue).toHaveProperty('paused')
            expect(gatherQueue).toHaveProperty('metrics')
        })

        it('should include queue performance metrics', async () => {
            const result = await controller.getQueueMetrics()
            const gatherQueue = result.queues['gather']

            expect(gatherQueue.metrics).toHaveProperty('throughput')
            expect(gatherQueue.metrics).toHaveProperty('avgWaitTime')
            expect(gatherQueue.metrics).toHaveProperty('avgProcessingTime')
            expect(gatherQueue.metrics).toHaveProperty('errorRate')

            expect(gatherQueue.metrics.errorRate).toBeGreaterThanOrEqual(0)
            expect(gatherQueue.metrics.errorRate).toBeLessThanOrEqual(100)
        })
    })

    describe('getRPCMetrics', () => {
        it('should return RPC metrics', async () => {
            const result = await controller.getRPCMetrics()

            expect(result).toEqual(mockRPCMetrics)
            expect(metricsService.getRPCMetrics).toHaveBeenCalledTimes(1)
        })

        it('should return metrics with providers array', async () => {
            const result = await controller.getRPCMetrics()

            expect(result).toHaveProperty('timestamp')
            expect(result).toHaveProperty('providers')
            expect(Array.isArray(result.providers)).toBe(true)
        })

        it('should include provider details', async () => {
            const result = await controller.getRPCMetrics()
            const provider = result.providers[0]

            expect(provider).toHaveProperty('name')
            expect(provider).toHaveProperty('url')
            expect(provider).toHaveProperty('status')
            expect(provider).toHaveProperty('metrics')

            expect(['healthy', 'degraded', 'down']).toContain(provider.status)
        })

        it('should include provider performance metrics', async () => {
            const result = await controller.getRPCMetrics()
            const provider = result.providers[0]

            expect(provider.metrics).toHaveProperty('totalRequests')
            expect(provider.metrics).toHaveProperty('successRate')
            expect(provider.metrics).toHaveProperty('avgLatency')
            expect(provider.metrics).toHaveProperty('p95Latency')
            expect(provider.metrics).toHaveProperty('errorRate')

            expect(provider.metrics.successRate).toBeGreaterThanOrEqual(0)
            expect(provider.metrics.successRate).toBeLessThanOrEqual(100)
        })
    })
})
