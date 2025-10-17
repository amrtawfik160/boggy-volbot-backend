import { BaseWorker, BaseWorkerConfig, JobContext } from './BaseWorker';
import { GatherJobPayload } from '../types';

export interface GatherJobData extends GatherJobPayload {
  runId?: string;
  campaignId?: string;
  poolId?: string;
  dbJobId?: string;
}

export interface GatherJobResult {
  success: boolean;
  poolInfo?: {
    poolId: string;
    baseMint: string;
    quoteMint: string;
    liquidity: number;
  };
}

export class GatherWorker extends BaseWorker<GatherJobData, GatherJobResult> {
  constructor(config: Omit<BaseWorkerConfig, 'queueName'>) {
    super({
      ...config,
      queueName: 'gather',
      enableIdempotency: false, // Gathering pool info doesn't require idempotency
      enableDeadLetterQueue: true,
    });
  }

  protected async execute(
    data: GatherJobData,
    context: JobContext
  ): Promise<GatherJobResult> {
    const { runId, campaignId, poolId } = data;

    await context.updateProgress(10, 'Fetching pool information');

    // Get pool info from database
    const { data: pool, error } = await context.supabase
      .from('pools')
      .select('*, tokens(*)')
      .eq('id', poolId)
      .single();

    if (error || !pool) {
      throw new Error(`Pool not found: ${poolId}. Error: ${error?.message}`);
    }

    await context.updateProgress(50, 'Processing pool data');

    const poolInfo = {
      poolId: pool.pool_address,
      baseMint: pool.tokens.mint,
      quoteMint: 'So11111111111111111111111111111111111111112', // SOL
      liquidity: pool.metadata?.liquidity || 0,
    };

    await context.updateProgress(100, 'Pool information gathered successfully');

    return { success: true, poolInfo };
  }
}
