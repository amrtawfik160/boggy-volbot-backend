import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

describe('Job Concurrency Limits and Queue Isolation', () => {
  let redisConnection: IORedis;
  let queues: Queue[] = [];
  let workers: Worker[] = [];

  beforeAll(() => {
    redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  });

  afterAll(async () => {
    await redisConnection.quit();
  });

  beforeEach(async () => {
    queues = [];
    workers = [];
  });

  afterEach(async () => {
    // Close all workers and queues
    for (const worker of workers) {
      await worker.close();
    }
    for (const queue of queues) {
      await queue.obliterate({ force: true });
      await queue.close();
    }
    workers = [];
    queues = [];
  });

  describe('Concurrency Limits Per Queue', () => {
    it('should respect concurrency limit of 1', async () => {
      const queue = new Queue('test-concurrency-1', { connection: redisConnection });
      queues.push(queue);

      const activeJobs: number[] = [];
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const worker = new Worker(
        'test-concurrency-1',
        async (job: Job) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          activeJobs.push(currentConcurrent);

          await new Promise(resolve => setTimeout(resolve, 100));

          currentConcurrent--;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 1 }
      );
      workers.push(worker);

      // Enqueue 5 jobs
      const jobs = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          queue.add('process', { index: i })
        )
      );

      await Promise.all(jobs.map(job => job.waitUntilFinished(queue.events, 15000)));

      expect(maxConcurrent).toBe(1);
    }, 30000);

    it('should respect concurrency limit of 3', async () => {
      const queue = new Queue('test-concurrency-3', { connection: redisConnection });
      queues.push(queue);

      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const worker = new Worker(
        'test-concurrency-3',
        async (job: Job) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

          await new Promise(resolve => setTimeout(resolve, 200));

          currentConcurrent--;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 3 }
      );
      workers.push(worker);

      // Enqueue 10 jobs
      const jobs = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          queue.add('process', { index: i })
        )
      );

      await Promise.all(jobs.map(job => job.waitUntilFinished(queue.events, 20000)));

      expect(maxConcurrent).toBeLessThanOrEqual(3);
      expect(maxConcurrent).toBeGreaterThanOrEqual(2); // Should use available concurrency
    }, 40000);

    it('should respect concurrency limit of 5', async () => {
      const queue = new Queue('test-concurrency-5', { connection: redisConnection });
      queues.push(queue);

      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const worker = new Worker(
        'test-concurrency-5',
        async (job: Job) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

          await new Promise(resolve => setTimeout(resolve, 150));

          currentConcurrent--;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 5 }
      );
      workers.push(worker);

      // Enqueue 15 jobs
      const jobs = await Promise.all(
        Array.from({ length: 15 }, (_, i) =>
          queue.add('process', { index: i })
        )
      );

      await Promise.all(jobs.map(job => job.waitUntilFinished(queue.events, 20000)));

      expect(maxConcurrent).toBeLessThanOrEqual(5);
      expect(maxConcurrent).toBeGreaterThanOrEqual(3); // Should use available concurrency
    }, 40000);
  });

  describe('Queue Isolation', () => {
    it('should process jobs independently in different queues', async () => {
      const queue1 = new Queue('test-queue-1', { connection: redisConnection });
      const queue2 = new Queue('test-queue-2', { connection: redisConnection });
      queues.push(queue1, queue2);

      const queue1Jobs: number[] = [];
      const queue2Jobs: number[] = [];

      const worker1 = new Worker(
        'test-queue-1',
        async (job: Job) => {
          queue1Jobs.push(job.data.index);
          await new Promise(resolve => setTimeout(resolve, 50));
          return { success: true, queue: 'queue1' };
        },
        { connection: redisConnection as any, concurrency: 2 }
      );

      const worker2 = new Worker(
        'test-queue-2',
        async (job: Job) => {
          queue2Jobs.push(job.data.index);
          await new Promise(resolve => setTimeout(resolve, 50));
          return { success: true, queue: 'queue2' };
        },
        { connection: redisConnection as any, concurrency: 2 }
      );

      workers.push(worker1, worker2);

      // Enqueue jobs to both queues
      const jobs1 = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          queue1.add('process', { index: i })
        )
      );

      const jobs2 = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          queue2.add('process', { index: i })
        )
      );

      await Promise.all([
        ...jobs1.map(job => job.waitUntilFinished(queue1.events, 15000)),
        ...jobs2.map(job => job.waitUntilFinished(queue2.events, 15000)),
      ]);

      expect(queue1Jobs.length).toBe(5);
      expect(queue2Jobs.length).toBe(5);
      expect(queue1Jobs).toEqual([0, 1, 2, 3, 4]);
      expect(queue2Jobs).toEqual([0, 1, 2, 3, 4]);
    }, 30000);

    it('should not allow one queue to starve another', async () => {
      const queue1 = new Queue('test-queue-fast', { connection: redisConnection });
      const queue2 = new Queue('test-queue-slow', { connection: redisConnection });
      queues.push(queue1, queue2);

      let queue1Completed = 0;
      let queue2Completed = 0;

      const worker1 = new Worker(
        'test-queue-fast',
        async (job: Job) => {
          await new Promise(resolve => setTimeout(resolve, 50));
          queue1Completed++;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 5 }
      );

      const worker2 = new Worker(
        'test-queue-slow',
        async (job: Job) => {
          await new Promise(resolve => setTimeout(resolve, 100));
          queue2Completed++;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 2 }
      );

      workers.push(worker1, worker2);

      // Enqueue many jobs to queue1 and some to queue2
      const jobs1 = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          queue1.add('fast-process', { index: i })
        )
      );

      const jobs2 = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          queue2.add('slow-process', { index: i })
        )
      );

      await Promise.all([
        ...jobs1.map(job => job.waitUntilFinished(queue1.events, 20000)),
        ...jobs2.map(job => job.waitUntilFinished(queue2.events, 20000)),
      ]);

      // Both queues should complete all their jobs
      expect(queue1Completed).toBe(20);
      expect(queue2Completed).toBe(5);
    }, 40000);

    it('should maintain separate concurrency limits for each queue', async () => {
      const queue1 = new Queue('test-queue-limit-1', { connection: redisConnection });
      const queue2 = new Queue('test-queue-limit-5', { connection: redisConnection });
      queues.push(queue1, queue2);

      let maxConcurrent1 = 0;
      let currentConcurrent1 = 0;
      let maxConcurrent2 = 0;
      let currentConcurrent2 = 0;

      const worker1 = new Worker(
        'test-queue-limit-1',
        async (job: Job) => {
          currentConcurrent1++;
          maxConcurrent1 = Math.max(maxConcurrent1, currentConcurrent1);

          await new Promise(resolve => setTimeout(resolve, 100));

          currentConcurrent1--;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 1 }
      );

      const worker2 = new Worker(
        'test-queue-limit-5',
        async (job: Job) => {
          currentConcurrent2++;
          maxConcurrent2 = Math.max(maxConcurrent2, currentConcurrent2);

          await new Promise(resolve => setTimeout(resolve, 100));

          currentConcurrent2--;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 5 }
      );

      workers.push(worker1, worker2);

      // Enqueue jobs to both queues
      const jobs1 = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          queue1.add('process', { index: i })
        )
      );

      const jobs2 = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          queue2.add('process', { index: i })
        )
      );

      await Promise.all([
        ...jobs1.map(job => job.waitUntilFinished(queue1.events, 20000)),
        ...jobs2.map(job => job.waitUntilFinished(queue2.events, 20000)),
      ]);

      expect(maxConcurrent1).toBe(1);
      expect(maxConcurrent2).toBeLessThanOrEqual(5);
      expect(maxConcurrent2).toBeGreaterThanOrEqual(2);
    }, 40000);
  });

  describe('Priority Handling Across Queues', () => {
    it('should respect priority within a single queue', async () => {
      const queue = new Queue('test-priority-queue', { connection: redisConnection });
      queues.push(queue);

      const processedOrder: number[] = [];

      const worker = new Worker(
        'test-priority-queue',
        async (job: Job) => {
          processedOrder.push(job.data.priority);
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 1 }
      );
      workers.push(worker);

      // Add jobs with different priorities (lower number = higher priority)
      await queue.add('low', { priority: 10 }, { priority: 10 });
      await queue.add('medium', { priority: 5 }, { priority: 5 });
      await queue.add('high', { priority: 1 }, { priority: 1 });

      await new Promise(resolve => setTimeout(resolve, 500));

      // High priority (1) should be processed before medium (5) and low (10)
      expect(processedOrder[0]).toBe(1);
    }, 30000);

    it('should not interfere with priority between different queues', async () => {
      const queue1 = new Queue('test-priority-q1', { connection: redisConnection });
      const queue2 = new Queue('test-priority-q2', { connection: redisConnection });
      queues.push(queue1, queue2);

      const queue1Order: number[] = [];
      const queue2Order: number[] = [];

      const worker1 = new Worker(
        'test-priority-q1',
        async (job: Job) => {
          queue1Order.push(job.data.value);
          await new Promise(resolve => setTimeout(resolve, 50));
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 1 }
      );

      const worker2 = new Worker(
        'test-priority-q2',
        async (job: Job) => {
          queue2Order.push(job.data.value);
          await new Promise(resolve => setTimeout(resolve, 50));
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 1 }
      );

      workers.push(worker1, worker2);

      // Queue 1: High priority job
      await queue1.add('q1-high', { value: 1 }, { priority: 1 });
      // Queue 2: Low priority job (should still process independently)
      await queue2.add('q2-low', { value: 10 }, { priority: 10 });

      await new Promise(resolve => setTimeout(resolve, 300));

      // Both queues should have processed their jobs independently
      expect(queue1Order).toContain(1);
      expect(queue2Order).toContain(10);
    }, 30000);
  });

  describe('Load Testing and Stress Scenarios', () => {
    it('should handle high load with concurrency limits', async () => {
      const queue = new Queue('test-load-queue', { connection: redisConnection });
      queues.push(queue);

      let completed = 0;
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const worker = new Worker(
        'test-load-queue',
        async (job: Job) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

          await new Promise(resolve => setTimeout(resolve, 50));

          currentConcurrent--;
          completed++;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 5 }
      );
      workers.push(worker);

      // Enqueue 50 jobs
      const jobs = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          queue.add('process', { index: i })
        )
      );

      await Promise.all(jobs.map(job => job.waitUntilFinished(queue.events, 30000)));

      expect(completed).toBe(50);
      expect(maxConcurrent).toBeLessThanOrEqual(5);
    }, 60000);

    it('should maintain performance with multiple queues under load', async () => {
      const queue1 = new Queue('test-load-q1', { connection: redisConnection });
      const queue2 = new Queue('test-load-q2', { connection: redisConnection });
      const queue3 = new Queue('test-load-q3', { connection: redisConnection });
      queues.push(queue1, queue2, queue3);

      let completed1 = 0;
      let completed2 = 0;
      let completed3 = 0;

      const worker1 = new Worker(
        'test-load-q1',
        async (job: Job) => {
          await new Promise(resolve => setTimeout(resolve, 30));
          completed1++;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 3 }
      );

      const worker2 = new Worker(
        'test-load-q2',
        async (job: Job) => {
          await new Promise(resolve => setTimeout(resolve, 30));
          completed2++;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 3 }
      );

      const worker3 = new Worker(
        'test-load-q3',
        async (job: Job) => {
          await new Promise(resolve => setTimeout(resolve, 30));
          completed3++;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 3 }
      );

      workers.push(worker1, worker2, worker3);

      // Enqueue 20 jobs to each queue
      const jobs1 = await Promise.all(
        Array.from({ length: 20 }, (_, i) => queue1.add('process', { index: i }))
      );
      const jobs2 = await Promise.all(
        Array.from({ length: 20 }, (_, i) => queue2.add('process', { index: i }))
      );
      const jobs3 = await Promise.all(
        Array.from({ length: 20 }, (_, i) => queue3.add('process', { index: i }))
      );

      await Promise.all([
        ...jobs1.map(job => job.waitUntilFinished(queue1.events, 20000)),
        ...jobs2.map(job => job.waitUntilFinished(queue2.events, 20000)),
        ...jobs3.map(job => job.waitUntilFinished(queue3.events, 20000)),
      ]);

      expect(completed1).toBe(20);
      expect(completed2).toBe(20);
      expect(completed3).toBe(20);
    }, 60000);
  });

  describe('Campaign-Specific Queue Scenarios', () => {
    it('should handle trade.buy queue with concurrency of 3', async () => {
      const tradeBuyQueue = new Queue('trade.buy', { connection: redisConnection });
      queues.push(tradeBuyQueue);

      let maxConcurrent = 0;
      let currentConcurrent = 0;
      const completedJobs: string[] = [];

      const worker = new Worker(
        'trade.buy',
        async (job: Job) => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

          await new Promise(resolve => setTimeout(resolve, 100));

          completedJobs.push(job.data.walletId);
          currentConcurrent--;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 3 }
      );
      workers.push(worker);

      // Simulate multiple wallet buy transactions
      const jobs = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          tradeBuyQueue.add('buy-token', {
            walletId: `wallet-${i}`,
            amount: 0.001,
          })
        )
      );

      await Promise.all(jobs.map(job => job.waitUntilFinished(tradeBuyQueue.events, 20000)));

      expect(completedJobs.length).toBe(10);
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    }, 40000);

    it('should isolate gather queue from trade queues', async () => {
      const gatherQueue = new Queue('gather', { connection: redisConnection });
      const buyQueue = new Queue('trade.buy', { connection: redisConnection });
      queues.push(gatherQueue, buyQueue);

      let gatherCompleted = 0;
      let buyCompleted = 0;

      const gatherWorker = new Worker(
        'gather',
        async (job: Job) => {
          await new Promise(resolve => setTimeout(resolve, 50));
          gatherCompleted++;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 1 }
      );

      const buyWorker = new Worker(
        'trade.buy',
        async (job: Job) => {
          await new Promise(resolve => setTimeout(resolve, 50));
          buyCompleted++;
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 3 }
      );

      workers.push(gatherWorker, buyWorker);

      // Enqueue jobs
      const gatherJobs = await Promise.all(
        Array.from({ length: 3 }, () =>
          gatherQueue.add('gather-pool-info', { poolId: 'pool-1' })
        )
      );

      const buyJobs = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          buyQueue.add('buy-token', { walletId: `wallet-${i}` })
        )
      );

      await Promise.all([
        ...gatherJobs.map(job => job.waitUntilFinished(gatherQueue.events, 15000)),
        ...buyJobs.map(job => job.waitUntilFinished(buyQueue.events, 15000)),
      ]);

      expect(gatherCompleted).toBe(3);
      expect(buyCompleted).toBe(10);
    }, 30000);
  });
});
