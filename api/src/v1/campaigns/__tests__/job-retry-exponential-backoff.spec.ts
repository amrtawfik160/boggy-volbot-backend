import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

describe('Job Retry Logic and Exponential Backoff', () => {
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
    testQueue = new Queue('test-retry-backoff', { connection: redisConnection });
    dlqQueue = new Queue('test-retry-backoff.dlq', { connection: redisConnection });
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

  describe('Retry Configuration', () => {
    it('should enqueue job with retry attempts specified', async () => {
      const job = await testQueue.add('retryable-job', { test: 'data' }, { attempts: 3 });
      expect(job.opts.attempts).toBe(3);
    });

    it('should enqueue job with default attempts when not specified', async () => {
      const job = await testQueue.add('default-attempts', { test: 'data' });
      expect(job.opts.attempts).toBe(0);
    });
  });

  describe('Exponential Backoff Strategy', () => {
    it('should calculate exponential backoff delays correctly', () => {
      const calculateBackoff = (attemptsMade: number): number => {
        return Math.min(Math.pow(2, attemptsMade) * 1000, 60000);
      };

      expect(calculateBackoff(0)).toBe(1000);
      expect(calculateBackoff(1)).toBe(2000);
      expect(calculateBackoff(2)).toBe(4000);
      expect(calculateBackoff(3)).toBe(8000);
      expect(calculateBackoff(4)).toBe(16000);
      expect(calculateBackoff(5)).toBe(32000);
      expect(calculateBackoff(6)).toBe(60000);
      expect(calculateBackoff(7)).toBe(60000);
    });
  });

  describe('Transient Failures with Retries', () => {
    it('should retry job on transient failure', async () => {
      let attemptCount = 0;

      testWorker = new Worker(
        'test-retry-backoff',
        async (job: Job) => {
          attemptCount++;
          if (attemptCount <= 2) {
            throw new Error(`Transient failure ${attemptCount}`);
          }
          return { success: true, attempts: attemptCount };
        },
        { connection: redisConnection as any }
      );

      const job = await testQueue.add('transient-failure', { test: 'retry-me' }, { attempts: 3 });
      const result = await job.waitUntilFinished(testQueue.events, 20000);

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
    }, 30000);

    it('should track attemptsMade on each retry', async () => {
      const attemptsLog: number[] = [];

      testWorker = new Worker(
        'test-retry-backoff',
        async (job: Job) => {
          attemptsLog.push(job.attemptsMade);
          if (job.attemptsMade < 2) {
            throw new Error(`Attempt ${job.attemptsMade} failed`);
          }
          return { success: true };
        },
        { connection: redisConnection as any }
      );

      const job = await testQueue.add('track-attempts', { test: 'tracking' }, { attempts: 3 });
      await job.waitUntilFinished(testQueue.events, 20000);

      expect(attemptsLog).toEqual([0, 1, 2]);
    }, 30000);
  });

  describe('Permanent Failures', () => {
    it('should fail permanently after max attempts', async () => {
      let attemptCount = 0;

      testWorker = new Worker(
        'test-retry-backoff',
        async (job: Job) => {
          attemptCount++;
          throw new Error('Permanent failure');
        },
        { connection: redisConnection as any }
      );

      const job = await testQueue.add('permanent-failure', { test: 'fail' }, { attempts: 3 });

      try {
        await job.waitUntilFinished(testQueue.events, 20000);
        fail('Should have failed');
      } catch (error: any) {
        expect(error.message).toContain('Permanent failure');
        expect(attemptCount).toBe(3);
      }
    }, 30000);
  });

  describe('Dead Letter Queue (DLQ)', () => {
    it('should move failed job to DLQ after max retries', async () => {
      const maxAttempts = 3;

      testWorker = new Worker(
        'test-retry-backoff',
        async (job: Job) => {
          throw new Error('Always fails - DLQ test');
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

      const job = await testQueue.add('dlq-test', { test: 'dlq' }, { attempts: maxAttempts });

      try {
        await job.waitUntilFinished(testQueue.events, 20000);
      } catch (error) {
        // Expected to fail
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      const dlqJobs = await dlqQueue.getJobs(['waiting', 'completed']);
      expect(dlqJobs.length).toBeGreaterThanOrEqual(1);

      const dlqJob = dlqJobs[0];
      expect(dlqJob.data.originalJob).toEqual({ test: 'dlq' });
      expect(dlqJob.data.attempts).toBe(maxAttempts);
    }, 30000);
  });

  describe('Integration with Campaign Jobs', () => {
    it('should retry buy job on transient blockchain error', async () => {
      let attemptCount = 0;

      testWorker = new Worker(
        'test-retry-backoff',
        async (job: Job) => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error('Transaction failed: Blockhash not found');
          }
          return { success: true, signature: 'mock-signature-123' };
        },
        { connection: redisConnection as any }
      );

      const job = await testQueue.add(
        'buy-token',
        { campaignId: 'campaign-1', walletId: 'wallet-1', amount: 0.001 },
        { attempts: 3 }
      );

      const result = await job.waitUntilFinished(testQueue.events, 20000);

      expect(result.success).toBe(true);
      expect(result.signature).toBe('mock-signature-123');
      expect(attemptCount).toBe(2);
    }, 30000);
  });
});
