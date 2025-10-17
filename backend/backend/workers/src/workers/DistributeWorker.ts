import { Connection } from '@solana/web3.js';
import { Queue } from 'bullmq';
import bs58 from 'bs58';
import { BaseWorker, BaseWorkerConfig, JobContext } from './BaseWorker';
import { DistributeJobPayload, QueueNames } from '../types';
import { DistributionService } from '../core/legacy/services/distribution-service';
import { getKeypairFromEncrypted } from './utils/crypto';
import { encryptPrivateKey } from './utils/crypto';

export interface DistributeJobData extends DistributeJobPayload {
  campaignId?: string;
  distributionNum?: number;
  runId?: string;
  dbJobId?: string;
}

export interface DistributeJobResult {
  success: boolean;
  distributedWallets?: number;
}

export class DistributeWorker extends BaseWorker<DistributeJobData, DistributeJobResult> {
  private connection: Connection;
  private tradeBuyQueue: Queue;

  constructor(
    config: Omit<BaseWorkerConfig, 'queueName'>,
    connection: Connection,
    tradeBuyQueue: Queue
  ) {
    super({
      ...config,
      queueName: 'distribute',
      concurrency: 2,
      enableIdempotency: false, // Distribution doesn't use signature-based idempotency
      enableDeadLetterQueue: true,
    });

    this.connection = connection;
    this.tradeBuyQueue = tradeBuyQueue;
  }

  protected async execute(
    data: DistributeJobData,
    context: JobContext
  ): Promise<DistributeJobResult> {
    const { campaignId, distributionNum, runId } = data;

    await context.updateProgress(10, 'Fetching campaign details');

    // Get campaign details
    const { data: campaign, error: campaignError } = await context.supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error(`Campaign not found: ${campaignId}. Error: ${campaignError?.message}`);
    }

    await context.updateProgress(20, 'Fetching main wallet');

    // Get main wallet
    const { data: wallets } = await context.supabase
      .from('wallets')
      .select('*')
      .eq('user_id', campaign.user_id)
      .eq('is_active', true);

    if (!wallets || wallets.length === 0) {
      throw new Error('No active wallets available');
    }

    const mainWallet = wallets[0];
    if (!mainWallet.encrypted_private_key) {
      throw new Error('Main wallet has no private key');
    }

    await context.updateProgress(30, 'Decrypting main wallet');

    // Decrypt main wallet
    const mainKeypair = getKeypairFromEncrypted(Buffer.from(mainWallet.encrypted_private_key));

    await context.updateProgress(40, `Distributing SOL to ${distributionNum} wallets`);

    // Execute distribution
    const distributionService = new DistributionService(this.connection);
    const distributionResult = await distributionService.distributeSol(
      mainKeypair,
      distributionNum || 10
    );

    if (!distributionResult.success) {
      throw new Error(`Distribution failed: ${distributionResult.failed} wallets failed`);
    }

    await context.updateProgress(60, 'Storing generated wallets and enqueueing buy jobs');

    // Store generated wallets in database and enqueue initial trades
    const createdAddresses: string[] = [];
    const totalWallets = distributionResult.wallets.length;
    let processedWallets = 0;

    for (const w of distributionResult.wallets) {
      try {
        const enc = encryptPrivateKey(bs58.encode(w.kp.secretKey));
        const address = w.kp.publicKey.toBase58();
        createdAddresses.push(address);

        // Insert wallet
        await context.supabase.from('wallets').insert({
          user_id: campaign.user_id,
          address,
          encrypted_private_key: enc,
          label: `Campaign ${campaignId} Wallet`,
          is_active: true,
        });

        // Create and enqueue initial buy job for this wallet
        const { data: jobRow } = await context.supabase
          .from('jobs')
          .insert({
            run_id: runId,
            queue: QueueNames.TRADE_BUY,
            type: 'buy-token',
            payload: { campaignId, amount: w.buyAmount },
            status: 'queued',
          })
          .select()
          .single();

        // Need the just-inserted wallet id to associate
        const { data: insertedWallet } = await context.supabase
          .from('wallets')
          .select('id')
          .eq('user_id', campaign.user_id)
          .eq('address', address)
          .single();

        await this.tradeBuyQueue.add(
          'buy-token',
          {
            runId,
            campaignId,
            walletId: insertedWallet?.id,
            amount: w.buyAmount,
            dbJobId: jobRow?.id,
          },
          { delay: Math.round(Math.random() * 2000 + 1000) }
        );

        processedWallets++;
        await context.updateProgress(
          60 + Math.floor((processedWallets / totalWallets) * 30),
          `Stored ${processedWallets}/${totalWallets} wallets`
        );
      } catch (e) {
        console.error('Failed to store/enqueue generated wallet', e);
      }
    }

    await context.updateProgress(100, `Distribution completed - ${distributionResult.wallets.length} wallets created`);

    return {
      success: true,
      distributedWallets: distributionResult.wallets.length
    };
  }
}
