import { Worker, Job, WorkerOptions, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger, createChildLogger } from '../config/logger';
import type pino from 'pino';
import { MetricsService } from '../services/metrics.service';

export interface BaseWorkerConfig {
  queueName: string;
  connection: IORedis;
  concurrency?: number;
  supabase: SupabaseClient;
  metricsService?: MetricsService;
  enableIdempotency?: boolean;
  enableDeadLetterQueue?: boolean;
  deadLetterQueueName?: string;
}

export interface JobContext {
  job: Job;
  supabase: SupabaseClient;
  logger: pino.Logger;
  updateProgress: (progress: number, message?: string) => Promise<void>;
  checkIdempotency: (signature: string) => Promise<boolean>;
  markProcessed: (signature: string) => Promise<void>;
}

export abstract class BaseWorker<T = any, R = any> {
  protected worker: Worker;
  protected config: BaseWorkerConfig;
  protected deadLetterQueue?: Queue;
  protected logger: pino.Logger;
  protected metricsService?: MetricsService;
  private processedSignatures: Set<string> = new Set();

  constructor(config: BaseWorkerConfig) {
    this.config = config;
    this.logger = createLogger({ name: config.queueName });
    this.metricsService = config.metricsService;

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
      const context: any = { jobId: job.id };
      if ((job.data as any)?.campaignId) context.campaignId = (job.data as any).campaignId;
      if ((job.data as any)?.dbJobId) context.dbJobId = (job.data as any).dbJobId;

      this.logger.info(context, 'Job completed successfully');

      // Track job completion metrics
      if (this.metricsService) {
        this.metricsService.jobsProcessedCounter.inc({
          queue_name: this.config.queueName,
          status: 'success'
        });
      }

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

      const context: any = { jobId: job.id, error: error.message };
      if ((job.data as any)?.campaignId) context.campaignId = (job.data as any).campaignId;
      if ((job.data as any)?.dbJobId) context.dbJobId = (job.data as any).dbJobId;

      this.logger.error(context, 'Job failed');

      // Track job failure metrics
      if (this.metricsService) {
        this.metricsService.jobsFailedCounter.inc({
          queue_name: this.config.queueName,
          error_type: error.name || 'Error'
        });
      }

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
      const context: any = { jobId: job.id, progress };
      if ((job.data as any)?.campaignId) context.campaignId = (job.data as any).campaignId;

      this.logger.debug(context, 'Job progress update');
    });

    this.worker.on('error', (error: Error) => {
      this.logger.error({ error: error.message, stack: error.stack }, 'Worker error');
    });
  }

  private async processJob(job: Job<T>): Promise<R> {
    // Start timer for job processing duration
    const startTime = Date.now();

    // Create contextual logger with job context
    const logContext: any = { jobId: job.id };
    if ((job.data as any)?.campaignId) logContext.campaignId = (job.data as any).campaignId;
    if ((job.data as any)?.walletId) logContext.walletId = (job.data as any).walletId;
    if ((job.data as any)?.dbJobId) logContext.dbJobId = (job.data as any).dbJobId;

    const contextLogger = createChildLogger(this.logger, logContext);
    contextLogger.info('Processing job');

    // Create job context with helper methods
    const context: JobContext = {
      job,
      supabase: this.config.supabase,
      logger: contextLogger,

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
          contextLogger.debug({ signature }, 'Signature already processed (cache)');
          return true;
        }

        // Check database for signature
        const { data: execution } = await this.config.supabase
          .from('executions')
          .select('id')
          .eq('tx_signature', signature)
          .single();

        if (execution) {
          contextLogger.debug({ signature }, 'Signature already processed (database)');
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

      // Track job processing duration
      if (this.metricsService) {
        const durationSeconds = (Date.now() - startTime) / 1000;
        this.metricsService.jobProcessingDuration.observe(
          {
            queue_name: this.config.queueName,
            job_type: job.name
          },
          durationSeconds
        );
      }

      contextLogger.info('Job execution completed');
      return result;
    } catch (error: any) {
      // Track job processing duration even on failure
      if (this.metricsService) {
        const durationSeconds = (Date.now() - startTime) / 1000;
        this.metricsService.jobProcessingDuration.observe(
          {
            queue_name: this.config.queueName,
            job_type: job.name
          },
          durationSeconds
        );
      }

      contextLogger.error({ error: error.message, stack: error.stack }, 'Job execution error');
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

  /**
   * Update queue depth metric
   * Should be called periodically to track queue depth
   */
  async updateQueueDepthMetric(): Promise<void> {
    if (!this.metricsService) return;

    try {
      const queue = new Queue(this.config.queueName, {
        connection: this.config.connection
      });

      const waiting = await queue.getWaitingCount();
      const active = await queue.getActiveCount();
      const delayed = await queue.getDelayedCount();
      const depth = waiting + active + delayed;

      this.metricsService.queueDepthGauge.set(
        { queue_name: this.config.queueName },
        depth
      );

      await queue.close();
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Failed to update queue depth metric');
    }
  }
}
