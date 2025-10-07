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
  WebhookWorker,
  FundsGatherWorker,
} from './workers';

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

// Create queues for job scheduling (used by workers to enqueue follow-up jobs)
const tradeBuyQueue = new Queue('trade.buy', { connection: redisConnection });
const tradeSellQueue = new Queue('trade.sell', { connection: redisConnection });

// Initialize all workers
const gatherWorker = new GatherWorker({
  connection: redisConnection,
  supabase,
});

const tradeBuyWorker = new TradeBuyWorker(
  {
    connection: redisConnection,
    supabase,
  },
  connection
);

const tradeSellWorker = new TradeSellWorker(
  {
    connection: redisConnection,
    supabase,
  },
  connection,
  tradeBuyQueue,
  tradeSellQueue
);

const distributeWorker = new DistributeWorker(
  {
    connection: redisConnection,
    supabase,
  },
  connection,
  tradeBuyQueue
);

const statusWorker = new StatusWorker({
  connection: redisConnection,
  supabase,
});

const webhookWorker = new WebhookWorker({
  connection: redisConnection,
  supabase,
});

const fundsGatherWorker = new FundsGatherWorker(
  {
    connection: redisConnection,
    supabase,
  },
  connection
);

// Event listeners for monitoring
const workers = [
  gatherWorker,
  tradeBuyWorker,
  tradeSellWorker,
  distributeWorker,
  statusWorker,
  webhookWorker,
  fundsGatherWorker,
];

workers.forEach((worker) => {
  const workerInstance = worker.getWorker();

  workerInstance.on('completed', (job) => {
    console.log(`✅ Worker ${workerInstance.name}: Job ${job.id} completed`);
  });

  workerInstance.on('failed', (job, err) => {
    console.error(`❌ Worker ${workerInstance.name}: Job ${job?.id} failed:`, err.message);
  });

  workerInstance.on('error', (err) => {
    console.error(`⚠️ Worker ${workerInstance.name} error:`, err);
  });
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutdown signal received, closing workers...');

  await Promise.all(workers.map(w => w.close()));
  await tradeBuyQueue.close();
  await tradeSellQueue.close();
  await redisConnection.quit();

  console.log('All workers closed gracefully');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('✨ Volume Bot Workers Started');
console.log('🔄 Workers initialized:');
console.log('  - Gather Worker (concurrency: 5)');
console.log('  - Trade Buy Worker (concurrency: 3)');
console.log('  - Trade Sell Worker (concurrency: 3)');
console.log('  - Distribute Worker (concurrency: 2)');
console.log('  - Status Worker (concurrency: 5)');
console.log('  - Webhook Worker (concurrency: 10)');
console.log('  - Funds Gather Worker (concurrency: 1)');
console.log('📡 Listening for jobs...');
