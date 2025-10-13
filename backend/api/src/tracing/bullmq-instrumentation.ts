/**
 * BullMQ OpenTelemetry Instrumentation
 *
 * Provides automatic tracing for BullMQ job processing.
 * Creates spans for job execution with relevant attributes.
 */

import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { Job, Worker, Queue } from 'bullmq';

const tracer = trace.getTracer('volume-bot-bullmq');

/**
 * Wraps a BullMQ job processor function with OpenTelemetry tracing
 *
 * Usage:
 * ```typescript
 * const worker = new Worker('my-queue', withJobTracing(async (job) => {
 *   // Job processing logic
 * }), { connection });
 * ```
 *
 * Creates a span for each job with attributes:
 * - job.id: BullMQ job ID
 * - job.name: Job name
 * - job.queue: Queue name
 * - job.attempt: Current attempt number
 * - job.data: Job data (stringified)
 */
export function withJobTracing<T = any, R = any>(
  processor: (job: Job<T, R>) => Promise<R>,
): (job: Job<T, R>) => Promise<R> {
  return async function (job: Job<T, R>): Promise<R> {
    const spanName = `job.process:${job.queueName}.${job.name}`;

    const span = tracer.startSpan(spanName, {
      kind: SpanKind.CONSUMER,
      attributes: {
        'messaging.system': 'bullmq',
        'messaging.operation': 'process',
        'messaging.destination': job.queueName,
        'messaging.message_id': job.id || 'unknown',
        'job.id': job.id || 'unknown',
        'job.name': job.name,
        'job.queue': job.queueName,
        'job.attempt': job.attemptsMade,
        'job.timestamp': job.timestamp,
      },
    });

    // Add job data as attribute (limit size to avoid huge spans)
    try {
      const dataStr = JSON.stringify(job.data);
      if (dataStr.length < 1000) {
        span.setAttribute('job.data', dataStr);
      } else {
        span.setAttribute(
          'job.data',
          dataStr.substring(0, 1000) + '...',
        );
      }
    } catch (e) {
      // Ignore serialization errors
    }

    try {
      // Run the processor in the span context
      const result = await context.with(
        trace.setSpan(context.active(), span),
        async () => {
          return await processor(job);
        },
      );

      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute('job.result', 'success');

      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error as Error);
      span.setAttribute('job.result', 'error');
      span.setAttribute(
        'job.error',
        error instanceof Error ? error.message : String(error),
      );

      // Re-throw to let BullMQ handle retry logic
      throw error;
    } finally {
      span.end();
    }
  };
}

/**
 * Instruments a BullMQ Worker to automatically trace all job processing
 *
 * Usage:
 * ```typescript
 * const worker = new Worker('my-queue', async (job) => {
 *   // Job processing logic
 * }, { connection });
 *
 * instrumentWorker(worker);
 * ```
 */
export function instrumentWorker(worker: Worker): void {
  // Listen to worker events and add them as span events/logs

  worker.on('active', (job) => {
    const span = tracer.startSpan(`job.active:${job.queueName}.${job.name}`, {
      kind: SpanKind.CONSUMER,
      attributes: {
        'messaging.system': 'bullmq',
        'messaging.operation': 'active',
        'job.id': job.id || 'unknown',
        'job.name': job.name,
        'job.queue': job.queueName,
      },
    });
    span.end();
  });

  worker.on('completed', (job) => {
    const span = tracer.startSpan(
      `job.completed:${job.queueName}.${job.name}`,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'bullmq',
          'messaging.operation': 'completed',
          'job.id': job.id || 'unknown',
          'job.name': job.name,
          'job.queue': job.queueName,
          'job.duration_ms': Date.now() - job.timestamp,
        },
      },
    );
    span.end();
  });

  worker.on('failed', (job, error) => {
    if (!job) return;

    const span = tracer.startSpan(`job.failed:${job.queueName}.${job.name}`, {
      kind: SpanKind.CONSUMER,
      attributes: {
        'messaging.system': 'bullmq',
        'messaging.operation': 'failed',
        'job.id': job.id || 'unknown',
        'job.name': job.name,
        'job.queue': job.queueName,
        'job.attempt': job.attemptsMade,
        'error.message': error.message,
      },
    });
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    span.end();
  });

  worker.on('stalled', (jobId) => {
    const span = tracer.startSpan(`job.stalled`, {
      kind: SpanKind.CONSUMER,
      attributes: {
        'messaging.system': 'bullmq',
        'messaging.operation': 'stalled',
        'job.id': jobId,
      },
    });
    span.end();
  });
}

/**
 * Instruments a BullMQ Queue to trace job additions
 *
 * Usage:
 * ```typescript
 * const queue = new Queue('my-queue', { connection });
 * instrumentQueue(queue);
 * ```
 */
export function instrumentQueue(queue: Queue): void {
  // Wrap the add method to create spans for job enqueueing
  const originalAdd = queue.add.bind(queue);

  (queue.add as any) = async function (
    name: string,
    data: any,
    opts?: any,
  ) {
    const spanName = `job.enqueue:${queue.name}.${name}`;

    const span = tracer.startSpan(spanName, {
      kind: SpanKind.PRODUCER,
      attributes: {
        'messaging.system': 'bullmq',
        'messaging.operation': 'enqueue',
        'messaging.destination': queue.name,
        'job.name': name,
        'job.queue': queue.name,
        'job.priority': opts?.priority,
        'job.delay': opts?.delay,
      },
    });

    try {
      const job = await context.with(
        trace.setSpan(context.active(), span),
        async () => {
          return await originalAdd(name, data, opts);
        },
      );

      span.setAttribute('job.id', job.id || 'unknown');
      span.setStatus({ code: SpanStatusCode.OK });

      return job;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  };
}
