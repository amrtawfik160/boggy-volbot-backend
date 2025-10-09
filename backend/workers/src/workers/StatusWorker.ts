import { BaseWorker, BaseWorkerConfig, JobContext } from './BaseWorker';
import { StatusJobPayload } from '../types';

export interface StatusJobData extends StatusJobPayload {
  campaignId?: string;
  runId?: string; // Specific run ID to aggregate
  dbJobId?: string;
}

export interface JobMetrics {
  totalJobs: number;
  succeededJobs: number;
  failedJobs: number;
  queuedJobs: number;
  runningJobs: number;
  cancelledJobs: number;
  successRate: number;

  // Queue-specific breakdown
  byQueue: {
    [queueName: string]: {
      total: number;
      succeeded: number;
      failed: number;
      queued: number;
      running: number;
    };
  };

  // Execution stats
  totalExecutions: number;
  avgLatencyMs: number;
}

export interface StatusJobResult {
  success: boolean;
  runId?: string;
  campaignId?: string;
  metrics?: JobMetrics;
  updatedAt?: string;
}

export interface StatusWorkerConfig extends Omit<BaseWorkerConfig, 'queueName'> {
  websocketBroadcast?: (campaignId: string, event: string, data: any) => void;
}

export class StatusWorker extends BaseWorker<StatusJobData, StatusJobResult> {
  private websocketBroadcast?: (campaignId: string, event: string, data: any) => void;

  constructor(config: StatusWorkerConfig) {
    super({
      ...config,
      queueName: 'status',
      concurrency: 5,
      enableIdempotency: false,
      enableDeadLetterQueue: true,
    });

    this.websocketBroadcast = config.websocketBroadcast;
  }

  protected async execute(
    data: StatusJobData,
    context: JobContext
  ): Promise<StatusJobResult> {
    const { campaignId, runId } = data;

    if (!campaignId && !runId) {
      console.error('[STATUS] Missing campaignId or runId in job data');
      return { success: false };
    }

    await context.updateProgress(20, 'Fetching campaign run');

    // Fetch the specific run (or latest run if runId not provided)
    let targetRun: any;

    if (runId) {
      const { data: run, error } = await context.supabase
        .from('campaign_runs')
        .select('*, jobs(*, executions(*))')
        .eq('id', runId)
        .single();

      if (error || !run) {
        console.error(`[STATUS] Error fetching run ${runId}:`, error);
        return { success: false };
      }

      targetRun = run;
    } else if (campaignId) {
      // Fallback to latest run for the campaign
      const { data: runs, error } = await context.supabase
        .from('campaign_runs')
        .select('*, jobs(*, executions(*))')
        .eq('campaign_id', campaignId)
        .order('started_at', { ascending: false })
        .limit(1);

      if (error || !runs || runs.length === 0) {
        return { success: true, metrics: this.getEmptyMetrics() };
      }

      targetRun = runs[0];
    }

    await context.updateProgress(50, 'Calculating statistics');

    // Calculate comprehensive metrics
    const metrics = this.calculateMetrics(targetRun);

    await context.updateProgress(70, 'Updating run summary');

    // Update run summary in database
    const { error: updateError } = await context.supabase
      .from('campaign_runs')
      .update({
        summary: metrics,
      })
      .eq('id', targetRun.id);

    if (updateError) {
      console.error(`[STATUS] Error updating run summary:`, updateError);
    }

    await context.updateProgress(90, 'Broadcasting update');

    // Broadcast update via WebSocket if configured
    if (this.websocketBroadcast && targetRun.campaign_id) {
      try {
        this.websocketBroadcast(targetRun.campaign_id, 'campaign:status', {
          runId: targetRun.id,
          campaignId: targetRun.campaign_id,
          status: targetRun.status,
          metrics,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[STATUS] Error broadcasting via WebSocket:', error);
      }
    }

    await context.updateProgress(100, 'Status update completed');

    return {
      success: true,
      runId: targetRun.id,
      campaignId: targetRun.campaign_id,
      metrics,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate comprehensive metrics from run data
   */
  private calculateMetrics(run: any): JobMetrics {
    const jobs = run.jobs || [];

    // Overall counts
    const totalJobs = jobs.length;
    const succeededJobs = jobs.filter((j: any) => j.status === 'succeeded').length;
    const failedJobs = jobs.filter((j: any) => j.status === 'failed').length;
    const queuedJobs = jobs.filter((j: any) => j.status === 'queued').length;
    const runningJobs = jobs.filter((j: any) => j.status === 'running').length;
    const cancelledJobs = jobs.filter((j: any) => j.status === 'cancelled').length;
    const successRate = totalJobs > 0 ? succeededJobs / totalJobs : 0;

    // Queue-specific breakdown
    const byQueue: JobMetrics['byQueue'] = {};
    for (const job of jobs) {
      const queueName = job.queue || 'unknown';
      if (!byQueue[queueName]) {
        byQueue[queueName] = {
          total: 0,
          succeeded: 0,
          failed: 0,
          queued: 0,
          running: 0,
        };
      }

      byQueue[queueName].total++;
      if (job.status === 'succeeded') byQueue[queueName].succeeded++;
      if (job.status === 'failed') byQueue[queueName].failed++;
      if (job.status === 'queued') byQueue[queueName].queued++;
      if (job.status === 'running') byQueue[queueName].running++;
    }

    // Execution statistics
    const executions = jobs.flatMap((j: any) => j.executions || []);
    const totalExecutions = executions.length;
    const avgLatencyMs = totalExecutions > 0
      ? executions.reduce((sum: number, e: any) => sum + (e.latency_ms || 0), 0) / totalExecutions
      : 0;

    return {
      totalJobs,
      succeededJobs,
      failedJobs,
      queuedJobs,
      runningJobs,
      cancelledJobs,
      successRate,
      byQueue,
      totalExecutions,
      avgLatencyMs: Math.round(avgLatencyMs),
    };
  }

  /**
   * Return empty metrics structure
   */
  private getEmptyMetrics(): JobMetrics {
    return {
      totalJobs: 0,
      succeededJobs: 0,
      failedJobs: 0,
      queuedJobs: 0,
      runningJobs: 0,
      cancelledJobs: 0,
      successRate: 0,
      byQueue: {},
      totalExecutions: 0,
      avgLatencyMs: 0,
    };
  }
}
