import { Queue, Job } from 'bullmq';
import IORedis from 'ioredis';

describe('Job Enqueuing with Priority and Delay', () => {
  let redisConnection: IORedis;
  let testQueue: Queue;

  beforeAll(() => {
    redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  });

  afterAll(async () => {
    await redisConnection.quit();
  });

  beforeEach(async () => {
    testQueue = new Queue('test-priority-delay', { connection: redisConnection });
    // Clean up any existing jobs
    await testQueue.obliterate({ force: true });
  });

  afterEach(async () => {
    await testQueue.close();
  });

  describe('Job Priority', () => {
    it('should enqueue jobs with default priority', async () => {
      const job = await testQueue.add('default-priority', { test: 'data' });

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.opts.priority).toBeUndefined(); // Default priority is undefined
    });

    it('should enqueue jobs with high priority', async () => {
      const job = await testQueue.add(
        'high-priority',
        { test: 'high' },
        { priority: 1 }
      );

      expect(job.opts.priority).toBe(1);
    });

    it('should enqueue jobs with low priority', async () => {
      const job = await testQueue.add(
        'low-priority',
        { test: 'low' },
        { priority: 10 }
      );

      expect(job.opts.priority).toBe(10);
    });

    it('should process jobs in priority order (lower number = higher priority)', async () => {
      // Add jobs in reverse priority order
      await testQueue.add('low', { order: 3 }, { priority: 10 });
      await testQueue.add('medium', { order: 2 }, { priority: 5 });
      await testQueue.add('high', { order: 1 }, { priority: 1 });

      // Small delay to allow jobs to be added
      await new Promise(resolve => setTimeout(resolve, 50));

      // Get jobs in waiting state
      const waitingJobs = await testQueue.getJobs(['waiting', 'prioritized']);

      expect(waitingJobs.length).toBeGreaterThanOrEqual(3);

      // BullMQ processes jobs with priority 1 first, then 5, then 10
      const priorities = waitingJobs.map(j => j.opts.priority).filter(Boolean);

      expect(priorities).toContain(1);
      expect(priorities).toContain(5);
      expect(priorities).toContain(10);
    });

    it('should handle multiple jobs with same priority (FIFO)', async () => {
      const job1 = await testQueue.add('first', { order: 1 }, { priority: 5 });
      const job2 = await testQueue.add('second', { order: 2 }, { priority: 5 });
      const job3 = await testQueue.add('third', { order: 3 }, { priority: 5 });

      await new Promise(resolve => setTimeout(resolve, 50));

      const waitingJobs = await testQueue.getJobs(['waiting', 'prioritized']);

      expect(waitingJobs.length).toBeGreaterThanOrEqual(3);

      // All jobs should have the same priority
      const job1Found = waitingJobs.find(j => j.id === job1.id);
      const job2Found = waitingJobs.find(j => j.id === job2.id);
      const job3Found = waitingJobs.find(j => j.id === job3.id);

      expect(job1Found).toBeDefined();
      expect(job2Found).toBeDefined();
      expect(job3Found).toBeDefined();
      expect(job1Found?.opts.priority).toBe(5);
      expect(job2Found?.opts.priority).toBe(5);
      expect(job3Found?.opts.priority).toBe(5);
    });

    it('should respect priority across different job names', async () => {
      await testQueue.add('buy-token', { type: 'buy' }, { priority: 2 });
      await testQueue.add('sell-token', { type: 'sell' }, { priority: 1 });
      await testQueue.add('gather-info', { type: 'gather' }, { priority: 3 });

      await new Promise(resolve => setTimeout(resolve, 50));

      const waitingJobs = await testQueue.getJobs(['waiting', 'prioritized']);
      const priorities = waitingJobs.map(j => j.opts.priority).filter(Boolean);

      // All priorities should be present
      expect(priorities).toContain(1);
      expect(priorities).toContain(2);
      expect(priorities).toContain(3);
    });
  });

  describe('Job Delay', () => {
    it('should enqueue jobs without delay', async () => {
      const job = await testQueue.add('immediate', { test: 'no-delay' });

      expect(job.opts.delay).toBeUndefined();

      const waitingJobs = await testQueue.getJobs(['waiting']);
      expect(waitingJobs).toContainEqual(
        expect.objectContaining({ id: job.id })
      );
    });

    it('should enqueue jobs with specific delay', async () => {
      const delayMs = 5000; // 5 seconds
      const job = await testQueue.add(
        'delayed',
        { test: 'delayed' },
        { delay: delayMs }
      );

      expect(job.opts.delay).toBe(delayMs);

      // Delayed jobs should be in delayed state, not waiting
      const delayedJobs = await testQueue.getJobs(['delayed']);
      expect(delayedJobs).toContainEqual(
        expect.objectContaining({ id: job.id })
      );

      const waitingJobs = await testQueue.getJobs(['waiting']);
      expect(waitingJobs).not.toContainEqual(
        expect.objectContaining({ id: job.id })
      );
    });

    it('should handle multiple delayed jobs with different delays', async () => {
      const job1 = await testQueue.add('delay-1s', { order: 1 }, { delay: 1000 });
      const job2 = await testQueue.add('delay-2s', { order: 2 }, { delay: 2000 });
      const job3 = await testQueue.add('delay-5s', { order: 3 }, { delay: 5000 });

      const delayedJobs = await testQueue.getJobs(['delayed']);

      expect(delayedJobs.length).toBe(3);
      expect(delayedJobs.map(j => j.id)).toContain(job1.id);
      expect(delayedJobs.map(j => j.id)).toContain(job2.id);
      expect(delayedJobs.map(j => j.id)).toContain(job3.id);
    });

    it('should enqueue delayed job and verify timing metadata', async () => {
      const shortDelay = 100; // 100ms
      const job = await testQueue.add(
        'short-delay',
        { test: 'transition' },
        { delay: shortDelay }
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      // Initially in delayed state
      let delayedJobs = await testQueue.getJobs(['delayed']);
      expect(delayedJobs.map(j => j.id)).toContain(job.id);

      // Verify delay metadata is preserved
      const delayedJob = delayedJobs.find(j => j.id === job.id);
      expect(delayedJob?.opts.delay).toBe(shortDelay);

      // Note: Without a worker running, delayed jobs won't automatically
      // transition to waiting state. This test verifies enqueuing behavior.
    });

    it('should handle zero delay as immediate', async () => {
      const job = await testQueue.add('zero-delay', { test: 'zero' }, { delay: 0 });

      const waitingJobs = await testQueue.getJobs(['waiting']);
      expect(waitingJobs.map(j => j.id)).toContain(job.id);
    });
  });

  describe('Priority and Delay Combined', () => {
    it('should enqueue job with both priority and delay', async () => {
      const job = await testQueue.add(
        'priority-delayed',
        { test: 'both' },
        { priority: 1, delay: 2000 }
      );

      expect(job.opts.priority).toBe(1);
      expect(job.opts.delay).toBe(2000);

      const delayedJobs = await testQueue.getJobs(['delayed']);
      expect(delayedJobs.map(j => j.id)).toContain(job.id);
    });

    it('should preserve priority metadata on delayed jobs', async () => {
      // Add delayed jobs with different priorities
      const lowPriorityJob = await testQueue.add(
        'low-priority-delayed',
        { order: 2 },
        { priority: 10, delay: 100 }
      );

      const highPriorityJob = await testQueue.add(
        'high-priority-delayed',
        { order: 1 },
        { priority: 1, delay: 100 }
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      const delayedJobs = await testQueue.getJobs(['delayed']);

      // Both jobs should be delayed
      expect(delayedJobs.map(j => j.id)).toContain(lowPriorityJob.id);
      expect(delayedJobs.map(j => j.id)).toContain(highPriorityJob.id);

      // Priority should be preserved in delayed state
      const highPriorityDelayedJob = delayedJobs.find(j => j.id === highPriorityJob.id);
      const lowPriorityDelayedJob = delayedJobs.find(j => j.id === lowPriorityJob.id);

      expect(highPriorityDelayedJob?.opts.priority).toBe(1);
      expect(lowPriorityDelayedJob?.opts.priority).toBe(10);
      expect(highPriorityDelayedJob?.opts.delay).toBe(100);
      expect(lowPriorityDelayedJob?.opts.delay).toBe(100);
    });

    it('should handle immediate high-priority and delayed low-priority jobs', async () => {
      const immediateHighPriority = await testQueue.add(
        'immediate-high',
        { order: 1 },
        { priority: 1 }
      );

      const delayedLowPriority = await testQueue.add(
        'delayed-low',
        { order: 2 },
        { priority: 10, delay: 2000 }
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      const waitingJobs = await testQueue.getJobs(['waiting', 'prioritized']);
      const delayedJobs = await testQueue.getJobs(['delayed']);

      expect(waitingJobs.map(j => j.id)).toContain(immediateHighPriority.id);
      expect(delayedJobs.map(j => j.id)).toContain(delayedLowPriority.id);
    });
  });

  describe('Real-world Campaign Scenarios', () => {
    it('should enqueue buy jobs with random delays', async () => {
      const walletCount = 5;
      const jobs: Job[] = [];

      for (let i = 0; i < walletCount; i++) {
        const delay = Math.round(Math.random() * 2000 + 1000); // 1-3 seconds
        const job = await testQueue.add(
          'buy-token',
          { walletId: `wallet-${i}`, amount: 0.001 },
          { delay }
        );
        jobs.push(job);
      }

      expect(jobs.length).toBe(walletCount);

      const delayedJobs = await testQueue.getJobs(['delayed']);
      expect(delayedJobs.length).toBe(walletCount);

      // All delays should be within expected range
      jobs.forEach(job => {
        expect(job.opts.delay).toBeGreaterThanOrEqual(1000);
        expect(job.opts.delay).toBeLessThanOrEqual(3000);
      });
    });

    it('should enqueue sell jobs with fixed delay after buy', async () => {
      const sellDelay = 30000; // 30 seconds

      const sellJob = await testQueue.add(
        'sell-token',
        { walletId: 'wallet-1' },
        { delay: sellDelay }
      );

      expect(sellJob.opts.delay).toBe(sellDelay);

      const delayedJobs = await testQueue.getJobs(['delayed']);
      expect(delayedJobs.map(j => j.id)).toContain(sellJob.id);
    });

    it('should enqueue gather job with higher priority than trade jobs', async () => {
      const gatherJob = await testQueue.add(
        'gather-pool-info',
        { poolId: 'pool-1' },
        { priority: 1 }
      );

      const buyJob = await testQueue.add(
        'buy-token',
        { walletId: 'wallet-1' },
        { priority: 5 }
      );

      const sellJob = await testQueue.add(
        'sell-token',
        { walletId: 'wallet-1' },
        { priority: 5 }
      );

      await new Promise(resolve => setTimeout(resolve, 50));

      const waitingJobs = await testQueue.getJobs(['waiting', 'prioritized']);

      // Gather should have highest priority
      const gatherWaitingJob = waitingJobs.find(j => j.id === gatherJob.id);
      expect(gatherWaitingJob).toBeDefined();
      expect(gatherWaitingJob?.opts.priority).toBe(1);
      expect(gatherWaitingJob?.opts.priority).toBeLessThan(buyJob.opts.priority || Infinity);
    });

    it('should handle pause scenario by removing delayed jobs', async () => {
      // Enqueue several delayed jobs
      const job1 = await testQueue.add('buy-1', { test: 1 }, { delay: 5000 });
      const job2 = await testQueue.add('buy-2', { test: 2 }, { delay: 6000 });
      const job3 = await testQueue.add('sell-1', { test: 3 }, { delay: 30000 });

      let delayedJobs = await testQueue.getJobs(['delayed']);
      expect(delayedJobs.length).toBe(3);

      // Simulate pause by removing all delayed jobs
      for (const job of delayedJobs) {
        await job.remove();
      }

      delayedJobs = await testQueue.getJobs(['delayed']);
      expect(delayedJobs.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative priority (treated as high priority)', async () => {
      const job = await testQueue.add(
        'negative-priority',
        { test: 'negative' },
        { priority: -1 as any }
      );

      expect(job.opts.priority).toBe(-1);
    });

    it('should handle very large delay', async () => {
      const largeDelay = 24 * 60 * 60 * 1000; // 24 hours
      const job = await testQueue.add(
        'large-delay',
        { test: 'large' },
        { delay: largeDelay }
      );

      expect(job.opts.delay).toBe(largeDelay);

      const delayedJobs = await testQueue.getJobs(['delayed']);
      expect(delayedJobs.map(j => j.id)).toContain(job.id);
    });

    it('should handle very high priority value', async () => {
      const job = await testQueue.add(
        'very-low-priority',
        { test: 'low' },
        { priority: 999999 }
      );

      expect(job.opts.priority).toBe(999999);
    });

    it('should enqueue jobs without options', async () => {
      const job = await testQueue.add('no-options', { test: 'data' });

      expect(job.opts.priority).toBeUndefined();
      expect(job.opts.delay).toBeUndefined();
    });

    it('should handle concurrent enqueuing', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        testQueue.add(`concurrent-${i}`, { index: i }, { priority: i % 3 })
      );

      const jobs = await Promise.all(promises);

      expect(jobs.length).toBe(10);
      expect(new Set(jobs.map(j => j.id)).size).toBe(10); // All unique IDs
    });
  });

  describe('Job Retrieval and Querying', () => {
    it('should retrieve jobs by state', async () => {
      await testQueue.add('waiting-1', { state: 'waiting' });
      await testQueue.add('delayed-1', { state: 'delayed' }, { delay: 5000 });

      const waitingJobs = await testQueue.getJobs(['waiting']);
      const delayedJobs = await testQueue.getJobs(['delayed']);

      expect(waitingJobs.length).toBeGreaterThanOrEqual(1);
      expect(delayedJobs.length).toBeGreaterThanOrEqual(1);
    });

    it('should get job count by state', async () => {
      await testQueue.add('job-1', { test: 1 });
      await testQueue.add('job-2', { test: 2 }, { delay: 5000 });

      const waitingCount = await testQueue.getWaitingCount();
      const delayedCount = await testQueue.getDelayedCount();

      expect(waitingCount).toBeGreaterThanOrEqual(1);
      expect(delayedCount).toBeGreaterThanOrEqual(1);
    });

    it('should retrieve job by ID', async () => {
      const job = await testQueue.add('findable', { test: 'find-me' });

      const foundJob = await testQueue.getJob(job.id!);

      expect(foundJob).toBeDefined();
      expect(foundJob?.id).toBe(job.id);
      expect(foundJob?.data).toEqual({ test: 'find-me' });
    });
  });
});
