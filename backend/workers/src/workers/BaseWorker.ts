import { Worker, Job, WorkerOptions, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface BaseWorkerConfig {
  queueName: string;
  connection: IORedis;
  concurrency?: number;
  supabase: SupabaseClient;
  enableIdempotency?: boolean;
  enableDeadLetterQueue?: boolean;
  deadLetterQueueName?: string;
}

export interface JobContext {
  job: Job;
  supabase: SupabaseClient;
  updateProgress: (progress: number, message?: string) => Promise<void>;
  checkIdempotency: (signature: string) => Promise<boolean>;
  markProcessed: (signature: string) => Promise<void>;
}

export abstract class BaseWorker<T = any, R = any> {
  protected worker: Worker;
  protected config: BaseWorkerConfig;
  protected deadLetterQueue?: Queue;
  private processedSignatures: Set<string> = new Set();

  constructor(config: BaseWorkerConfig) {
    this.config = config;

    // Initialize dead-letter queue if enabled
    if (config.enableDeadLetterQueue) {
      const dlqName = config.deadLetterQueueName || `${config.queueName}.dlq`;
      this.deadLetterQueue = new Queue(dlqName, {
        connection: config.connection
      });
    }

    // Create the worker with enhanced options
    const workerOptions: WorkerOptions = {
      connection: config.connection as any,
      concurrency: config.concurrency || 5,

      // Exponential backoff for retries
      settings: {
        backoffStrategy: (attemptsMade: number) => {
          // Exponential backoff: 2^attempt * 1000ms (1s, 2s, 4s, 8s, 16s, etc.)
          const delay = Math.min(Math.pow(2, attemptsMade) * 1000, 60000); // Max 60s
          return delay;
        },
      },
    };

    this.worker = new Worker(
      config.queueName,
      async (job: Job<T>) => this.processJob(job),
      workerOptions
    );

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', async (job: Job) => {
      console.log(`[${this.config.queueName.toUpperCase()}] Job ${job.id} completed successfully`);

      // Update database job status if dbJobId is provided
      if ((job.data as any)?.dbJobId) {
        await this.config.supabase
          .from('jobs')
          .update({ status: 'succeeded' })
          .eq('id', (job.data as any).dbJobId);
      }
    });

    this.worker.on('failed', async (job: Job | undefined, error: Error) => {
      if (!job) return;

      console.error(`[${this.config.queueName.toUpperCase()}] Job ${job.id} failed:`, error);

      // Update database job status
      if ((job.data as any)?.dbJobId) {
        await this.config.supabase
          .from('jobs')
          .update({
            status: 'failed',
            error: { message: error.message, stack: error.stack }
          })
          .eq('id', (job.data as any).dbJobId);
      }

      // Move to dead-letter queue if max attempts reached
      if (this.deadLetterQueue && job.attemptsMade >= (job.opts.attempts || 3)) {
        await this.deadLetterQueue.add(
          `failed-${job.name}`,
          {
            originalJob: job.data,
            error: { message: error.message, stack: error.stack },
            attempts: job.attemptsMade,
            failedAt: new Date().toISOString(),
          },
          {
            removeOnComplete: false, // Keep for analysis
          }
        );
      }
    });

    this.worker.on('progress', (job: Job, progress: any) => {
      console.log(`[${this.config.queueName.toUpperCase()}] Job ${job.id} progress:`, progress);
    });

    this.worker.on('error', (error: Error) => {
      console.error(`[${this.config.queueName.toUpperCase()}] Worker error:`, error);
    });
  }

  private async processJob(job: Job<T>): Promise<R> {
    console.log(`[${this.config.queueName.toUpperCase()}] Processing job ${job.id}`, job.data);

    // Create job context with helper methods
    const context: JobContext = {
      job,
      supabase: this.config.supabase,

      updateProgress: async (progress: number, message?: string) => {
        await job.updateProgress({ progress, message, timestamp: Date.now() });

        // Also update database if dbJobId provided
        if ((job.data as any)?.dbJobId) {
          await this.config.supabase
            .from('jobs')
            .update({
              status: 'running',
              metadata: { progress, message }
            })
            .eq('id', (job.data as any).dbJobId);
        }
      },

      checkIdempotency: async (signature: string): Promise<boolean> => {
        if (!this.config.enableIdempotency) return false;

        // Check in-memory cache first
        if (this.processedSignatures.has(signature)) {
          console.log(`[${this.config.queueName.toUpperCase()}] Signature already processed (cache): ${signature}`);
          return true;
        }

        // Check database for signature
        const { data: execution } = await this.config.supabase
          .from('executions')
          .select('id')
          .eq('tx_signature', signature)
          .single();

        if (execution) {
          console.log(`[${this.config.queueName.toUpperCase()}] Signature already processed (db): ${signature}`);
          this.processedSignatures.add(signature);
          return true;
        }

        return false;
      },

      markProcessed: async (signature: string): Promise<void> => {
        if (!this.config.enableIdempotency) return;
        this.processedSignatures.add(signature);
      },
    };

    try {
      // Update job status to running
      if ((job.data as any)?.dbJobId) {
        await this.config.supabase
          .from('jobs')
          .update({ status: 'running' })
          .eq('id', (job.data as any).dbJobId);
      }

      // Execute the worker's specific logic
      const result = await this.execute(job.data, context);

      return result;
    } catch (error: any) {
      console.error(`[${this.config.queueName.toUpperCase()}] Job ${job.id} execution error:`, error);
      throw error; // Re-throw to trigger retry logic
    }
  }

  /**
   * Abstract method to be implemented by specific workers
   * Contains the actual job processing logic
   */
  protected abstract execute(data: T, context: JobContext): Promise<R>;

  /**
   * Close the worker gracefully
   */
  async close(): Promise<void> {
    await this.worker.close();
    if (this.deadLetterQueue) {
      await this.deadLetterQueue.close();
    }
  }

  /**
   * Get the underlying BullMQ Worker instance
   */
  getWorker(): Worker {
    return this.worker;
  }

  /**
   * Get the dead-letter queue if enabled
   */
  getDeadLetterQueue(): Queue | undefined {
    return this.deadLetterQueue;
  }
}
