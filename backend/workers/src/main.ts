import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { Connection } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import {
  GatherWorker,
  TradeBuyWorker,
  TradeSellWorker,
  DistributeWorker,
  StatusWorker,
  StatusAggregatorWorker,
  WebhookWorker,
  FundsGatherWorker,
} from './workers';
import { createLogger } from './config/logger';
import { MetricsService } from './services/metrics.service';
import { SentryService } from './services/sentry.service';

// Initialize Sentry early to catch all errors
SentryService.initialize();

// Initialize structured logger
const logger = createLogger({
  name: 'worker',
  environment: process.env.NODE_ENV,
  level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
});

// Initialize connections
const connection = new Connection(
  process.env.SOLANA_RPC_PRIMARY || 'https://api.mainnet-beta.solana.com'
);

const redisConnection = new IORedis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null, // Required for BullMQ
  }
);

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Initialize metrics service
const metricsService = new MetricsService();
logger.info('Metrics service initialized');

// Create queues for job scheduling (used by workers to enqueue follow-up jobs)
const tradeBuyQueue = new Queue('trade.buy', { connection: redisConnection });
const tradeSellQueue = new Queue('trade.sell', { connection: redisConnection });
const statusQueue = new Queue('status', { connection: redisConnection });

// Initialize all workers
const gatherWorker = new GatherWorker({
  connection: redisConnection,
  supabase,
  metricsService,
});

const tradeBuyWorker = new TradeBuyWorker(
  {
    connection: redisConnection,
    supabase,
    metricsService,
  },
  connection
);

const tradeSellWorker = new TradeSellWorker(
  {
    connection: redisConnection,
    supabase,
    metricsService,
  },
  connection,
  tradeBuyQueue,
  tradeSellQueue
);

const distributeWorker = new DistributeWorker(
  {
    connection: redisConnection,
    supabase,
    metricsService,
  },
  connection,
  tradeBuyQueue
);

const statusWorker = new StatusWorker({
  connection: redisConnection,
  supabase,
  metricsService,
  // WebSocket broadcasting will be handled by the API service
  // The StatusWorker updates the database, and the API polls or uses database triggers
});

const webhookWorker = new WebhookWorker({
  connection: redisConnection,
  supabase,
  metricsService,
});

const fundsGatherWorker = new FundsGatherWorker(
  {
    connection: redisConnection,
    supabase,
    metricsService,
  },
  connection
);

// Initialize Status Aggregator Worker
// This periodically schedules status jobs for active campaigns
const statusAggregatorWorker = new StatusAggregatorWorker({
  connection: redisConnection,
  supabase,
  statusQueue,
  intervalSeconds: parseInt(process.env.STATUS_AGGREGATOR_INTERVAL_SECONDS || '15'), // Default: 15 seconds
});

// Start the periodic scheduler
statusAggregatorWorker.start();

// Start periodic queue depth tracking (every 10 seconds)
const updateQueueDepths = async () => {
  try {
    await Promise.all([
      gatherWorker.updateQueueDepthMetric(),
      tradeBuyWorker.updateQueueDepthMetric(),
      tradeSellWorker.updateQueueDepthMetric(),
      distributeWorker.updateQueueDepthMetric(),
      statusWorker.updateQueueDepthMetric(),
      webhookWorker.updateQueueDepthMetric(),
      fundsGatherWorker.updateQueueDepthMetric(),
    ]);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to update queue depths');
  }
};

// Initial update
updateQueueDepths();

// Update every 10 seconds
const queueDepthInterval = setInterval(updateQueueDepths, 10000);

// Event listeners for monitoring
const workers = [
  gatherWorker,
  tradeBuyWorker,
  tradeSellWorker,
  distributeWorker,
  statusWorker,
  webhookWorker,
  fundsGatherWorker,
  statusAggregatorWorker,
];

workers.forEach((worker) => {
  const workerInstance = worker.getWorker();

  workerInstance.on('completed', (job) => {
    logger.info({
      worker: workerInstance.name,
      jobId: job.id,
    }, 'Worker job completed');
  });

  workerInstance.on('failed', (job, err) => {
    logger.error({
      worker: workerInstance.name,
      jobId: job?.id,
      error: err.message,
      stack: err.stack,
    }, 'Worker job failed');

    // Send to Sentry with job context
    SentryService.captureException(err, {
      worker: {
        name: workerInstance.name,
        jobId: job?.id,
        jobData: job?.data,
      },
    });
  });

  workerInstance.on('error', (err) => {
    logger.error({
      worker: workerInstance.name,
      error: err.message,
      stack: err.stack,
    }, 'Worker error');

    // Send to Sentry
    SentryService.captureException(err, {
      worker: {
        name: workerInstance.name,
      },
    });
  });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutdown signal received, closing workers...');

  // Stop the status aggregator first
  statusAggregatorWorker.stop();

  // Stop queue depth tracking
  clearInterval(queueDepthInterval);

  await Promise.all(workers.map(w => w.close()));
  await tradeBuyQueue.close();
  await tradeSellQueue.close();
  await statusQueue.close();
  await redisConnection.quit();

  // Close Sentry
  await SentryService.close();

  logger.info('All workers closed gracefully');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

logger.info('Volume Bot Workers Started');
logger.info({
  workers: [
    { name: 'Gather Worker', concurrency: 5 },
    { name: 'Trade Buy Worker', concurrency: 3 },
    { name: 'Trade Sell Worker', concurrency: 3 },
    { name: 'Distribute Worker', concurrency: 2 },
    { name: 'Status Worker', concurrency: 5 },
    { name: 'Status Aggregator Worker', interval: `${process.env.STATUS_AGGREGATOR_INTERVAL_SECONDS || '15'}s` },
    { name: 'Webhook Worker', concurrency: 10 },
    { name: 'Funds Gather Worker', concurrency: 1 },
  ],
}, 'Workers initialized');
logger.info('Listening for jobs...');
