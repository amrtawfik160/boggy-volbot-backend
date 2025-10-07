import { BaseWorker, BaseWorkerConfig, JobContext } from './BaseWorker';
import { StatusJobPayload } from '../types';

export interface StatusJobData extends StatusJobPayload {
  campaignId?: string;
  dbJobId?: string;
}

export interface StatusJobResult {
  success: boolean;
  stats?: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
  };
}

export class StatusWorker extends BaseWorker<StatusJobData, StatusJobResult> {
  constructor(config: Omit<BaseWorkerConfig, 'queueName'>) {
    super({
      ...config,
      queueName: 'status',
      concurrency: 5,
      enableIdempotency: false,
      enableDeadLetterQueue: true,
    });
  }

  protected async execute(
    data: StatusJobData,
    context: JobContext
  ): Promise<StatusJobResult> {
    const { campaignId } = data;

    await context.updateProgress(30, 'Fetching campaign runs');

    // Aggregate campaign statistics
    const { data: runs, error } = await context.supabase
      .from('campaign_runs')
      .select('*, jobs(*, executions(*))')
      .eq('campaign_id', campaignId);

    if (error || !runs || runs.length === 0) {
      return { success: true, stats: { totalJobs: 0, completedJobs: 0, failedJobs: 0 } };
    }

    await context.updateProgress(60, 'Calculating statistics');

    const latestRun = runs[0];
    const totalJobs = latestRun.jobs?.length || 0;
    const completedJobs = latestRun.jobs?.filter((j: any) => j.status === 'succeeded').length || 0;
    const failedJobs = latestRun.jobs?.filter((j: any) => j.status === 'failed').length || 0;

    await context.updateProgress(80, 'Updating run summary');

    // Update run summary
    await context.supabase
      .from('campaign_runs')
      .update({
        summary: {
          totalJobs,
          completedJobs,
          failedJobs,
          successRate: totalJobs > 0 ? completedJobs / totalJobs : 0,
        }
      })
      .eq('id', latestRun.id);

    await context.updateProgress(100, 'Status update completed');

    return {
      success: true,
      stats: { totalJobs, completedJobs, failedJobs }
    };
  }
}
