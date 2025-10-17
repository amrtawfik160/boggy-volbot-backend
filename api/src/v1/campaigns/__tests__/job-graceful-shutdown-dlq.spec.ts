import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

describe('Job Graceful Shutdown and DLQ Handling', () => {
  let redisConnection: IORedis;
  let testQueue: Queue;
  let testWorker: Worker | null;
  let dlqQueue: Queue;

  beforeAll(() => {
    redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  });

  afterAll(async () => {
    await redisConnection.quit();
  });

  beforeEach(async () => {
    testQueue = new Queue('test-shutdown', { connection: redisConnection });
    dlqQueue = new Queue('test-shutdown.dlq', { connection: redisConnection });
    testWorker = null;

    await testQueue.obliterate({ force: true });
    await dlqQueue.obliterate({ force: true });
  });

  afterEach(async () => {
    if (testWorker) {
      await testWorker.close();
      testWorker = null;
    }
    await testQueue.close();
    await dlqQueue.close();
  });

  describe('Graceful Shutdown', () => {
    it('should allow in-progress jobs to complete during shutdown', async () => {
      const completedJobs: string[] = [];
      let jobStarted = false;

      testWorker = new Worker(
        'test-shutdown',
        async (job: Job) => {
          jobStarted = true;
          await new Promise(resolve => setTimeout(resolve, 500));
          completedJobs.push(job.id!);
          return { success: true };
        },
        { connection: redisConnection as any }
      );

      const job = await testQueue.add('long-running', { test: 'data' });

      // Wait for job to start
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(jobStarted).toBe(true);

      // Initiate graceful shutdown
      const closePromise = testWorker.close();

      // Wait for shutdown to complete
      await closePromise;

      // Job should have completed
      expect(completedJobs).toContain(job.id);
    }, 30000);

    it('should not accept new jobs after shutdown is initiated', async () => {
      const processedJobs: string[] = [];

      testWorker = new Worker(
        'test-shutdown',
        async (job: Job) => {
          await new Promise(resolve => setTimeout(resolve, 100));
          processedJobs.push(job.id!);
          return { success: true };
        },
        { connection: redisConnection as any }
      );

      const job1 = await testQueue.add('job-1', { order: 1 });

      // Wait for first job to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Initiate shutdown
      const closePromise = testWorker.close();

      // Add more jobs after shutdown initiated
      const job2 = await testQueue.add('job-2', { order: 2 });
      const job3 = await testQueue.add('job-3', { order: 3 });

      await closePromise;

      // Only the first job should have been processed
      expect(processedJobs).toContain(job1.id);
      expect(processedJobs).not.toContain(job2.id);
      expect(processedJobs).not.toContain(job3.id);

      // Jobs 2 and 3 should still be in waiting state
      const waiting = await testQueue.getJobs(['waiting']);
      const waitingIds = waiting.map(j => j.id);
      expect(waitingIds).toContain(job2.id);
      expect(waitingIds).toContain(job3.id);
    }, 30000);

    it('should complete multiple in-progress jobs during shutdown', async () => {
      const completedJobs: string[] = [];

      testWorker = new Worker(
        'test-shutdown',
        async (job: Job) => {
          await new Promise(resolve => setTimeout(resolve, 300));
          completedJobs.push(job.id!);
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 3 }
      );

      // Enqueue 3 jobs that will run concurrently
      const job1 = await testQueue.add('job-1', { order: 1 });
      const job2 = await testQueue.add('job-2', { order: 2 });
      const job3 = await testQueue.add('job-3', { order: 3 });

      // Wait for all jobs to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Initiate shutdown
      await testWorker.close();

      // All 3 in-progress jobs should have completed
      expect(completedJobs.length).toBe(3);
      expect(completedJobs).toContain(job1.id);
      expect(completedJobs).toContain(job2.id);
      expect(completedJobs).toContain(job3.id);
    }, 30000);
  });

  describe('DLQ Handling During Shutdown', () => {
    it('should move failed jobs to DLQ during shutdown', async () => {
      const maxAttempts = 2;

      testWorker = new Worker(
        'test-shutdown',
        async (job: Job) => {
          throw new Error('Job fails during shutdown');
        },
        { connection: redisConnection as any }
      );

      testWorker.on('failed', async (job: Job | undefined, error: Error) => {
        if (job && job.attemptsMade >= maxAttempts) {
          await dlqQueue.add(`failed-${job.name}`, {
            originalJob: job.data,
            error: { message: error.message },
            attempts: job.attemptsMade,
            failedAt: new Date().toISOString(),
          });
        }
      });

      const job = await testQueue.add('failing-job', { test: 'fail' }, { attempts: maxAttempts });

      try {
        await job.waitUntilFinished(testQueue.events, 15000);
      } catch (error) {
        // Expected to fail
      }

      // Initiate shutdown
      await testWorker.close();

      // Check DLQ for failed job
      await new Promise(resolve => setTimeout(resolve, 200));
      const dlqJobs = await dlqQueue.getJobs(['waiting', 'completed']);

      expect(dlqJobs.length).toBeGreaterThanOrEqual(1);
      const dlqJob = dlqJobs.find(j => j.data.originalJob.test === 'fail');
      expect(dlqJob).toBeDefined();
      expect(dlqJob?.data.attempts).toBe(maxAttempts);
    }, 30000);

    it('should preserve DLQ jobs after shutdown', async () => {
      testWorker = new Worker(
        'test-shutdown',
        async (job: Job) => {
          throw new Error('Always fails');
        },
        { connection: redisConnection as any }
      );

      testWorker.on('failed', async (job: Job | undefined, error: Error) => {
        if (job && job.attemptsMade >= 1) {
          await dlqQueue.add(`failed-${job.name}`, {
            originalJob: job.data,
            error: { message: error.message },
            attempts: job.attemptsMade,
            failedAt: new Date().toISOString(),
          });
        }
      });

      const job = await testQueue.add('fail-and-preserve', { id: 'preserve-test' }, { attempts: 1 });

      try {
        await job.waitUntilFinished(testQueue.events, 15000);
      } catch (error) {
        // Expected
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Close worker and queues
      await testWorker.close();
      testWorker = null;

      // DLQ should still contain the failed job
      const dlqJobs = await dlqQueue.getJobs(['waiting', 'completed']);
      const preservedJob = dlqJobs.find(j => j.data.originalJob.id === 'preserve-test');

      expect(preservedJob).toBeDefined();
      expect(preservedJob?.data.error.message).toContain('Always fails');
    }, 30000);
  });

  describe('Shutdown with Active and Waiting Jobs', () => {
    it('should handle shutdown with both active and waiting jobs', async () => {
      const completedJobs: string[] = [];

      testWorker = new Worker(
        'test-shutdown',
        async (job: Job) => {
          await new Promise(resolve => setTimeout(resolve, 200));
          completedJobs.push(job.id!);
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 2 }
      );

      // Enqueue 5 jobs (2 will be active, 3 waiting)
      const job1 = await testQueue.add('job-1', { order: 1 });
      const job2 = await testQueue.add('job-2', { order: 2 });
      const job3 = await testQueue.add('job-3', { order: 3 });
      const job4 = await testQueue.add('job-4', { order: 4 });
      const job5 = await testQueue.add('job-5', { order: 5 });

      // Wait for first 2 jobs to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Initiate shutdown
      await testWorker.close();

      // Only the 2 active jobs should have completed
      expect(completedJobs.length).toBe(2);

      // Remaining 3 jobs should still be in queue
      const waiting = await testQueue.getJobs(['waiting']);
      expect(waiting.length).toBeGreaterThanOrEqual(3);
    }, 30000);

    it('should clean up resources after shutdown', async () => {
      testWorker = new Worker(
        'test-shutdown',
        async (job: Job) => {
          return { success: true };
        },
        { connection: redisConnection as any }
      );

      const job = await testQueue.add('cleanup-test', { test: 'cleanup' });
      await job.waitUntilFinished(testQueue.events, 15000);

      // Close worker
      await testWorker.close();
      testWorker = null;

      // Worker should be closed and not processing new jobs
      const job2 = await testQueue.add('should-not-process', { test: 'no-worker' });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Job should remain in waiting state
      const state = await job2.getState();
      expect(state).toBe('waiting');
    }, 30000);
  });

  describe('Forced Shutdown Scenarios', () => {
    it('should handle immediate shutdown request', async () => {
      const startedJobs: string[] = [];

      testWorker = new Worker(
        'test-shutdown',
        async (job: Job) => {
          startedJobs.push(job.id!);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return { success: true };
        },
        { connection: redisConnection as any }
      );

      const job = await testQueue.add('immediate-shutdown', { test: 'immediate' });

      // Wait briefly for job to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Immediate close (worker will wait for current job)
      await testWorker.close();

      expect(startedJobs).toContain(job.id);
    }, 30000);
  });

  describe('DLQ Contents Verification', () => {
    it('should verify DLQ contains correct error information', async () => {
      testWorker = new Worker(
        'test-shutdown',
        async (job: Job) => {
          throw new Error('Specific error message for DLQ');
        },
        { connection: redisConnection as any }
      );

      testWorker.on('failed', async (job: Job | undefined, error: Error) => {
        if (job && job.attemptsMade >= 2) {
          await dlqQueue.add(`failed-${job.name}`, {
            originalJob: job.data,
            error: { message: error.message, stack: error.stack },
            attempts: job.attemptsMade,
            failedAt: new Date().toISOString(),
            jobId: job.id,
          });
        }
      });

      const job = await testQueue.add('error-info-test', { data: 'test-data' }, { attempts: 2 });

      try {
        await job.waitUntilFinished(testQueue.events, 15000);
      } catch (error) {
        // Expected
      }

      await new Promise(resolve => setTimeout(resolve, 200));
      await testWorker.close();

      const dlqJobs = await dlqQueue.getJobs(['waiting', 'completed']);
      const dlqJob = dlqJobs[0];

      expect(dlqJob).toBeDefined();
      expect(dlqJob.data.error.message).toBe('Specific error message for DLQ');
      expect(dlqJob.data.error.stack).toBeDefined();
      expect(dlqJob.data.attempts).toBe(2);
      expect(dlqJob.data.failedAt).toBeDefined();
      expect(dlqJob.data.originalJob.data).toBe('test-data');
    }, 30000);

    it('should verify DLQ timestamp is within expected range', async () => {
      const beforeTime = new Date();

      testWorker = new Worker(
        'test-shutdown',
        async (job: Job) => {
          throw new Error('Timestamp test failure');
        },
        { connection: redisConnection as any }
      );

      testWorker.on('failed', async (job: Job | undefined, error: Error) => {
        if (job && job.attemptsMade >= 1) {
          await dlqQueue.add(`failed-${job.name}`, {
            originalJob: job.data,
            error: { message: error.message },
            attempts: job.attemptsMade,
            failedAt: new Date().toISOString(),
          });
        }
      });

      const job = await testQueue.add('timestamp-test', { test: 'time' }, { attempts: 1 });

      try {
        await job.waitUntilFinished(testQueue.events, 15000);
      } catch (error) {
        // Expected
      }

      await new Promise(resolve => setTimeout(resolve, 200));
      const afterTime = new Date();

      const dlqJobs = await dlqQueue.getJobs(['waiting', 'completed']);
      const dlqJob = dlqJobs[0];

      expect(dlqJob).toBeDefined();

      const failedAtTime = new Date(dlqJob.data.failedAt);
      expect(failedAtTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(failedAtTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    }, 30000);
  });

  describe('Campaign Shutdown Scenarios', () => {
    it('should handle campaign pause by shutting down workers gracefully', async () => {
      const buyQueue = new Queue('trade.buy', { connection: redisConnection });
      const sellQueue = new Queue('trade.sell', { connection: redisConnection });

      await buyQueue.obliterate({ force: true });
      await sellQueue.obliterate({ force: true });

      const buyCompleted: string[] = [];
      const sellCompleted: string[] = [];

      const buyWorker = new Worker(
        'trade.buy',
        async (job: Job) => {
          await new Promise(resolve => setTimeout(resolve, 200));
          buyCompleted.push(job.id!);
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 2 }
      );

      const sellWorker = new Worker(
        'trade.sell',
        async (job: Job) => {
          await new Promise(resolve => setTimeout(resolve, 200));
          sellCompleted.push(job.id!);
          return { success: true };
        },
        { connection: redisConnection as any, concurrency: 2 }
      );

      // Enqueue jobs
      const buyJob1 = await buyQueue.add('buy-1', { walletId: 'wallet-1' });
      const sellJob1 = await sellQueue.add('sell-1', { walletId: 'wallet-1' });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate campaign pause - shutdown both workers
      await Promise.all([buyWorker.close(), sellWorker.close()]);

      expect(buyCompleted).toContain(buyJob1.id);
      expect(sellCompleted).toContain(sellJob1.id);

      await buyQueue.close();
      await sellQueue.close();
    }, 30000);
  });
});
