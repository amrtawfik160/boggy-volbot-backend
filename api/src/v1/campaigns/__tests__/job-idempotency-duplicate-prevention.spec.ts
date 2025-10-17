import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

describe('Job Idempotency and Duplicate Prevention', () => {
  let redisConnection: IORedis;
  let testQueue: Queue;
  let testWorker: Worker | null;
  let processedSignatures: Set<string>;
  let executionLog: Array<{ jobId: string; signature: string; timestamp: number }>;

  beforeAll(() => {
    redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  });

  afterAll(async () => {
    await redisConnection.quit();
  });

  beforeEach(async () => {
    testQueue = new Queue('test-idempotency', { connection: redisConnection });
    testWorker = null;
    processedSignatures = new Set<string>();
    executionLog = [];

    await testQueue.obliterate({ force: true });
  });

  afterEach(async () => {
    if (testWorker) {
      await testWorker.close();
      testWorker = null;
    }
    await testQueue.close();
  });

  describe('Duplicate Job Prevention with Idempotency Keys', () => {
    it('should prevent duplicate execution with same idempotency key', async () => {
      let executionCount = 0;

      testWorker = new Worker(
        'test-idempotency',
        async (job: Job) => {
          const signature = job.data.signature;

          // Check idempotency
          if (processedSignatures.has(signature)) {
            return { success: true, signature, duplicate: true };
          }

          executionCount++;
          processedSignatures.add(signature);

          return { success: true, signature, executionNumber: executionCount };
        },
        { connection: redisConnection as any }
      );

      const idempotencyKey = 'tx-signature-12345';

      // Enqueue the same job 3 times with identical signature
      const job1 = await testQueue.add('process', { signature: idempotencyKey });
      const job2 = await testQueue.add('process', { signature: idempotencyKey });
      const job3 = await testQueue.add('process', { signature: idempotencyKey });

      const result1 = await job1.waitUntilFinished(testQueue.events, 15000);
      const result2 = await job2.waitUntilFinished(testQueue.events, 15000);
      const result3 = await job3.waitUntilFinished(testQueue.events, 15000);

      // Only one should actually execute, others should be marked as duplicates
      expect(executionCount).toBe(1);
      expect(result1.executionNumber).toBe(1);
      expect(result2.duplicate).toBe(true);
      expect(result3.duplicate).toBe(true);
    }, 30000);

    it('should allow execution of jobs with different idempotency keys', async () => {
      const executions: string[] = [];

      testWorker = new Worker(
        'test-idempotency',
        async (job: Job) => {
          const signature = job.data.signature;

          if (processedSignatures.has(signature)) {
            return { success: true, duplicate: true };
          }

          processedSignatures.add(signature);
          executions.push(signature);

          return { success: true, signature, executed: true };
        },
        { connection: redisConnection as any }
      );

      const job1 = await testQueue.add('process', { signature: 'tx-sig-1' });
      const job2 = await testQueue.add('process', { signature: 'tx-sig-2' });
      const job3 = await testQueue.add('process', { signature: 'tx-sig-3' });

      const result1 = await job1.waitUntilFinished(testQueue.events, 15000);
      const result2 = await job2.waitUntilFinished(testQueue.events, 15000);
      const result3 = await job3.waitUntilFinished(testQueue.events, 15000);

      expect(executions.length).toBe(3);
      expect(executions).toContain('tx-sig-1');
      expect(executions).toContain('tx-sig-2');
      expect(executions).toContain('tx-sig-3');
      expect(result1.executed).toBe(true);
      expect(result2.executed).toBe(true);
      expect(result3.executed).toBe(true);
    }, 30000);

    it('should handle concurrent duplicate job submissions', async () => {
      let actualExecutions = 0;

      testWorker = new Worker(
        'test-idempotency',
        async (job: Job) => {
          const signature = job.data.signature;

          if (processedSignatures.has(signature)) {
            return { success: true, duplicate: true };
          }

          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 50));

          processedSignatures.add(signature);
          actualExecutions++;

          return { success: true, signature, executionNumber: actualExecutions };
        },
        { connection: redisConnection as any, concurrency: 5 }
      );

      const signature = 'concurrent-tx-sig';

      // Submit 10 jobs concurrently with same signature
      const jobs = await Promise.all(
        Array.from({ length: 10 }, () =>
          testQueue.add('process', { signature })
        )
      );

      const results = await Promise.all(
        jobs.map(job => job.waitUntilFinished(testQueue.events, 15000))
      );

      // Only one should actually execute
      expect(actualExecutions).toBe(1);

      const executedResults = results.filter(r => r.executionNumber === 1);
      const duplicateResults = results.filter(r => r.duplicate === true);

      expect(executedResults.length).toBe(1);
      expect(duplicateResults.length).toBe(9);
    }, 30000);
  });

  describe('Transaction Signature Deduplication', () => {
    it('should deduplicate by transaction signature', async () => {
      const processedTxs: string[] = [];

      testWorker = new Worker(
        'test-idempotency',
        async (job: Job) => {
          const txSignature = job.data.txSignature;

          if (processedSignatures.has(txSignature)) {
            return { success: true, alreadyProcessed: true };
          }

          processedSignatures.add(txSignature);
          processedTxs.push(txSignature);

          return { success: true, txSignature, processed: true };
        },
        { connection: redisConnection as any }
      );

      const txSig = '5J7Xt...mock...signature';

      // Simulate retry scenario - same transaction signature
      const job1 = await testQueue.add('buy-token', {
        campaignId: 'campaign-1',
        walletId: 'wallet-1',
        txSignature: txSig,
      });

      const job2 = await testQueue.add('buy-token', {
        campaignId: 'campaign-1',
        walletId: 'wallet-1',
        txSignature: txSig,
      });

      const result1 = await job1.waitUntilFinished(testQueue.events, 15000);
      const result2 = await job2.waitUntilFinished(testQueue.events, 15000);

      expect(processedTxs.length).toBe(1);
      expect(result1.processed).toBe(true);
      expect(result2.alreadyProcessed).toBe(true);
    }, 30000);

    it('should track multiple unique transaction signatures', async () => {
      const processedTxs: Set<string> = new Set();

      testWorker = new Worker(
        'test-idempotency',
        async (job: Job) => {
          const txSignature = job.data.txSignature;

          if (processedSignatures.has(txSignature)) {
            return { success: true, duplicate: true };
          }

          processedSignatures.add(txSignature);
          processedTxs.add(txSignature);

          return { success: true, txSignature };
        },
        { connection: redisConnection as any }
      );

      const signatures = ['sig-1', 'sig-2', 'sig-3', 'sig-4', 'sig-5'];

      const jobs = await Promise.all(
        signatures.map(sig =>
          testQueue.add('process-tx', { txSignature: sig })
        )
      );

      await Promise.all(jobs.map(job => job.waitUntilFinished(testQueue.events, 15000)));

      expect(processedTxs.size).toBe(5);
      signatures.forEach(sig => {
        expect(processedTxs.has(sig)).toBe(true);
      });
    }, 30000);
  });

  describe('Job Restart and Crash Recovery', () => {
    it('should prevent duplicate execution after job restart', async () => {
      let executionAttempts = 0;

      testWorker = new Worker(
        'test-idempotency',
        async (job: Job) => {
          executionAttempts++;
          const signature = job.data.signature;

          if (processedSignatures.has(signature)) {
            return { success: true, wasAlreadyProcessed: true, attempts: executionAttempts };
          }

          // Simulate a failure on first attempt
          if (executionAttempts === 1) {
            throw new Error('Simulated crash');
          }

          processedSignatures.add(signature);
          return { success: true, signature, attempts: executionAttempts };
        },
        { connection: redisConnection as any }
      );

      const job = await testQueue.add(
        'process-with-restart',
        { signature: 'restart-test-sig' },
        { attempts: 3 }
      );

      const result = await job.waitUntilFinished(testQueue.events, 15000);

      expect(result.success).toBe(true);
      expect(executionAttempts).toBe(2); // Failed once, succeeded on second attempt
      expect(processedSignatures.has('restart-test-sig')).toBe(true);
    }, 30000);

    it('should maintain idempotency across worker restarts', async () => {
      const signature = 'persistent-sig';

      // First worker processes the job
      testWorker = new Worker(
        'test-idempotency',
        async (job: Job) => {
          processedSignatures.add(signature);
          return { success: true, firstWorker: true };
        },
        { connection: redisConnection as any }
      );

      const job1 = await testQueue.add('process', { signature });
      const result1 = await job1.waitUntilFinished(testQueue.events, 15000);

      expect(result1.firstWorker).toBe(true);
      expect(processedSignatures.has(signature)).toBe(true);

      // Close first worker and create second worker
      await testWorker.close();

      testWorker = new Worker(
        'test-idempotency',
        async (job: Job) => {
          const sig = job.data.signature;

          // Check if signature was processed (persisted across restart)
          if (processedSignatures.has(sig)) {
            return { success: true, duplicate: true, secondWorker: true };
          }

          return { success: true, secondWorker: true };
        },
        { connection: redisConnection as any }
      );

      const job2 = await testQueue.add('process', { signature });
      const result2 = await job2.waitUntilFinished(testQueue.events, 15000);

      expect(result2.duplicate).toBe(true);
      expect(result2.secondWorker).toBe(true);
    }, 30000);
  });

  describe('Edge Cases and Failure Scenarios', () => {
    it('should handle empty or null idempotency keys gracefully', async () => {
      let executionCount = 0;

      testWorker = new Worker(
        'test-idempotency',
        async (job: Job) => {
          executionCount++;
          const signature = job.data.signature;

          // If no signature, process normally without idempotency check
          if (!signature) {
            return { success: true, noSignature: true, executionNumber: executionCount };
          }

          if (processedSignatures.has(signature)) {
            return { success: true, duplicate: true };
          }

          processedSignatures.add(signature);
          return { success: true, signature };
        },
        { connection: redisConnection as any }
      );

      const job1 = await testQueue.add('process', { signature: null });
      const job2 = await testQueue.add('process', { signature: null });
      const job3 = await testQueue.add('process', { signature: undefined });

      const result1 = await job1.waitUntilFinished(testQueue.events, 15000);
      const result2 = await job2.waitUntilFinished(testQueue.events, 15000);
      const result3 = await job3.waitUntilFinished(testQueue.events, 15000);

      // All should execute since there's no valid signature for deduplication
      expect(executionCount).toBe(3);
      expect(result1.noSignature).toBe(true);
      expect(result2.noSignature).toBe(true);
      expect(result3.noSignature).toBe(true);
    }, 30000);

    it('should handle very long idempotency keys', async () => {
      const longSignature = 'sig-' + 'a'.repeat(500);
      let executionCount = 0;

      testWorker = new Worker(
        'test-idempotency',
        async (job: Job) => {
          const signature = job.data.signature;

          if (processedSignatures.has(signature)) {
            return { success: true, duplicate: true };
          }

          executionCount++;
          processedSignatures.add(signature);
          return { success: true, signature };
        },
        { connection: redisConnection as any }
      );

      const job1 = await testQueue.add('process', { signature: longSignature });
      const job2 = await testQueue.add('process', { signature: longSignature });

      const result1 = await job1.waitUntilFinished(testQueue.events, 15000);
      const result2 = await job2.waitUntilFinished(testQueue.events, 15000);

      expect(executionCount).toBe(1);
      expect(result2.duplicate).toBe(true);
      expect(processedSignatures.has(longSignature)).toBe(true);
    }, 30000);

    it('should handle rapid successive submissions with same key', async () => {
      let executionCount = 0;

      testWorker = new Worker(
        'test-idempotency',
        async (job: Job) => {
          const signature = job.data.signature;

          if (processedSignatures.has(signature)) {
            return { success: true, duplicate: true };
          }

          await new Promise(resolve => setTimeout(resolve, 100));

          executionCount++;
          processedSignatures.add(signature);
          return { success: true, executionNumber: executionCount };
        },
        { connection: redisConnection as any }
      );

      const signature = 'rapid-submission-sig';

      // Submit jobs rapidly
      const jobs: Job[] = [];
      for (let i = 0; i < 20; i++) {
        jobs.push(await testQueue.add('process', { signature }));
      }

      const results = await Promise.all(
        jobs.map(job => job.waitUntilFinished(testQueue.events, 20000))
      );

      expect(executionCount).toBe(1);

      const executed = results.filter(r => r.executionNumber === 1);
      const duplicates = results.filter(r => r.duplicate === true);

      expect(executed.length).toBe(1);
      expect(duplicates.length).toBe(19);
    }, 40000);
  });

  describe('Campaign Job Idempotency', () => {
    it('should prevent duplicate buy transactions with same signature', async () => {
      const buyExecutions: Array<{ walletId: string; signature: string }> = [];

      testWorker = new Worker(
        'test-idempotency',
        async (job: Job) => {
          const { walletId, txSignature } = job.data;

          if (processedSignatures.has(txSignature)) {
            return { success: true, signature: txSignature, alreadyExecuted: true };
          }

          processedSignatures.add(txSignature);
          buyExecutions.push({ walletId, signature: txSignature });

          return { success: true, signature: txSignature, newExecution: true };
        },
        { connection: redisConnection as any }
      );

      const txSig = 'buy-tx-signature-xyz';

      const job1 = await testQueue.add('buy-token', {
        campaignId: 'campaign-1',
        walletId: 'wallet-1',
        amount: 0.001,
        txSignature: txSig,
      });

      const job2 = await testQueue.add('buy-token', {
        campaignId: 'campaign-1',
        walletId: 'wallet-1',
        amount: 0.001,
        txSignature: txSig,
      });

      const result1 = await job1.waitUntilFinished(testQueue.events, 15000);
      const result2 = await job2.waitUntilFinished(testQueue.events, 15000);

      expect(buyExecutions.length).toBe(1);
      expect(result1.newExecution).toBe(true);
      expect(result2.alreadyExecuted).toBe(true);
    }, 30000);

    it('should allow multiple buy transactions with different signatures', async () => {
      const buyExecutions: string[] = [];

      testWorker = new Worker(
        'test-idempotency',
        async (job: Job) => {
          const { txSignature } = job.data;

          if (processedSignatures.has(txSignature)) {
            return { success: true, duplicate: true };
          }

          processedSignatures.add(txSignature);
          buyExecutions.push(txSignature);

          return { success: true, signature: txSignature };
        },
        { connection: redisConnection as any }
      );

      const job1 = await testQueue.add('buy-token', {
        walletId: 'wallet-1',
        txSignature: 'tx-1',
      });

      const job2 = await testQueue.add('buy-token', {
        walletId: 'wallet-2',
        txSignature: 'tx-2',
      });

      const job3 = await testQueue.add('buy-token', {
        walletId: 'wallet-3',
        txSignature: 'tx-3',
      });

      await Promise.all([
        job1.waitUntilFinished(testQueue.events, 15000),
        job2.waitUntilFinished(testQueue.events, 15000),
        job3.waitUntilFinished(testQueue.events, 15000),
      ]);

      expect(buyExecutions.length).toBe(3);
      expect(buyExecutions).toContain('tx-1');
      expect(buyExecutions).toContain('tx-2');
      expect(buyExecutions).toContain('tx-3');
    }, 30000);
  });
});
