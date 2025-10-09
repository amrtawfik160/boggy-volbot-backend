import { Queue, Worker, WorkerOptions } from 'bullmq';
import IORedis from 'ioredis';
import { SupabaseClient } from '@supabase/supabase-js';
import { QueueNames } from '../types/queues';

export interface StatusAggregatorConfig {
  connection: IORedis;
  supabase: SupabaseClient;
  statusQueue: Queue; // Queue to dispatch status jobs to
  intervalSeconds?: number; // How often to check for active campaigns (default: 15s)
}

interface CampaignSchedule {
  campaignId: string;
  runId: string;
  lastScheduled: number;
}

/**
 * StatusAggregatorWorker
 *
 * Manages periodic status aggregation for active campaigns by:
 * 1. Checking for active campaign runs every intervalSeconds (10-30s configurable)
 * 2. Dispatching status jobs to the StatusWorker queue for each active campaign
 * 3. Tracking last scheduled time to prevent duplicate scheduling
 *
 * This worker doesn't process individual status jobs - it's a scheduler that
 * ensures each active campaign gets regular status updates via the StatusWorker.
 */
export class StatusAggregatorWorker {
  private worker: Worker;
  private config: StatusAggregatorConfig;
  private intervalMs: number;
  private scheduledCampaigns: Map<string, CampaignSchedule> = new Map();
  private intervalHandle?: NodeJS.Timeout;

  constructor(config: StatusAggregatorConfig) {
    this.config = config;
    this.intervalMs = (config.intervalSeconds || 15) * 1000; // Default: 15 seconds

    // Create a worker that processes the scheduler job
    const workerOptions: WorkerOptions = {
      connection: config.connection as any,
      concurrency: 1, // Only need one instance to check and schedule
    };

    this.worker = new Worker(
      'status.aggregator',
      async () => this.checkAndScheduleActiveCampaigns(),
      workerOptions
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on('completed', (job) => {
      console.log(`[STATUS-AGGREGATOR] Scheduler job ${job.id} completed`);
    });

    this.worker.on('failed', (job, error) => {
      console.error(`[STATUS-AGGREGATOR] Scheduler job ${job?.id} failed:`, error.message);
    });

    this.worker.on('error', (error) => {
      console.error(`[STATUS-AGGREGATOR] Worker error:`, error);
    });
  }

  /**
   * Start the periodic scheduler
   * This runs every intervalMs and adds a job to trigger campaign checking
   */
  start(): void {
    console.log(`[STATUS-AGGREGATOR] Starting periodic scheduler (interval: ${this.intervalMs}ms)`);

    // Create a self-managed interval that adds jobs
    this.intervalHandle = setInterval(async () => {
      await this.checkAndScheduleActiveCampaigns();
    }, this.intervalMs);

    // Also run immediately on start
    this.checkAndScheduleActiveCampaigns();
  }

  /**
   * Stop the periodic scheduler
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
      console.log('[STATUS-AGGREGATOR] Stopped periodic scheduler');
    }
  }

  /**
   * Check for active campaigns and schedule status jobs
   */
  private async checkAndScheduleActiveCampaigns(): Promise<void> {
    try {
      console.log('[STATUS-AGGREGATOR] Checking for active campaigns...');

      // Query for active campaign runs
      const { data: activeCampaignRuns, error } = await this.config.supabase
        .from('campaign_runs')
        .select('id, campaign_id, campaigns!inner(id, status)')
        .in('status', ['running'])
        .in('campaigns.status', ['active'])
        .order('started_at', { ascending: false });

      if (error) {
        console.error('[STATUS-AGGREGATOR] Error fetching active campaigns:', error);
        return;
      }

      if (!activeCampaignRuns || activeCampaignRuns.length === 0) {
        console.log('[STATUS-AGGREGATOR] No active campaigns found');
        return;
      }

      console.log(`[STATUS-AGGREGATOR] Found ${activeCampaignRuns.length} active campaign run(s)`);

      const now = Date.now();
      let scheduled = 0;

      // Schedule status jobs for each active campaign run
      for (const run of activeCampaignRuns) {
        const campaignId = run.campaign_id;
        const runId = run.id;

        // Check if we recently scheduled this campaign
        const lastSchedule = this.scheduledCampaigns.get(campaignId);
        if (lastSchedule && (now - lastSchedule.lastScheduled) < this.intervalMs * 0.8) {
          // Skip if scheduled within 80% of interval (prevents duplicate scheduling)
          continue;
        }

        try {
          // Create DB job for status aggregation
          const { data: dbJob, error: jobError } = await this.config.supabase
            .from('jobs')
            .insert({
              run_id: runId,
              queue: QueueNames.STATUS,
              type: 'aggregate-status',
              payload: { campaignId, runId },
              status: 'queued',
            })
            .select()
            .single();

          if (jobError || !dbJob) {
            console.error(`[STATUS-AGGREGATOR] Error creating DB job for campaign ${campaignId}:`, jobError);
            continue;
          }

          // Dispatch status job to the StatusWorker queue
          await this.config.statusQueue.add(
            'aggregate-status',
            {
              campaignId,
              runId,
              dbJobId: dbJob.id,
            },
            {
              // Remove job from queue after completion to avoid memory buildup
              removeOnComplete: true,
              removeOnFail: false, // Keep failed jobs for debugging
            }
          );

          // Track that we scheduled this campaign
          this.scheduledCampaigns.set(campaignId, {
            campaignId,
            runId,
            lastScheduled: now,
          });

          scheduled++;
          console.log(`[STATUS-AGGREGATOR] Scheduled status aggregation for campaign ${campaignId} (run: ${runId})`);
        } catch (error) {
          console.error(`[STATUS-AGGREGATOR] Error scheduling campaign ${campaignId}:`, error);
        }
      }

      console.log(`[STATUS-AGGREGATOR] Scheduled ${scheduled} status job(s)`);

      // Clean up stale entries from scheduledCampaigns
      const activeCampaignIds = new Set(activeCampaignRuns.map(r => r.campaign_id));
      for (const [campaignId] of this.scheduledCampaigns) {
        if (!activeCampaignIds.has(campaignId)) {
          this.scheduledCampaigns.delete(campaignId);
        }
      }
    } catch (error) {
      console.error('[STATUS-AGGREGATOR] Error in checkAndScheduleActiveCampaigns:', error);
    }
  }

  /**
   * Close the worker gracefully
   */
  async close(): Promise<void> {
    this.stop();
    await this.worker.close();
    console.log('[STATUS-AGGREGATOR] Worker closed');
  }

  /**
   * Get the underlying BullMQ Worker instance
   */
  getWorker(): Worker {
    return this.worker;
  }
}
