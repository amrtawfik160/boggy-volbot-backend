import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { BaseWorker, BaseWorkerConfig, JobContext } from './BaseWorker';
import { TradeJobPayload } from '../types';
import { TradingService, TradingServiceConfig } from '../core/legacy/services/trading-service';
import { getKeypairFromEncrypted } from './utils/crypto';
import * as bs58 from 'bs58';

export interface TradeBuyJobData extends TradeJobPayload {
  runId?: string;
  campaignId?: string;
  walletId?: string;
  amount?: number;
  dbJobId?: string;
}

export interface TradeBuyJobResult {
  success: boolean;
  signature?: string;
}

export class TradeBuyWorker extends BaseWorker<TradeBuyJobData, TradeBuyJobResult> {
  private connection: Connection;

  constructor(
    config: Omit<BaseWorkerConfig, 'queueName'>,
    connection: Connection
  ) {
    super({
      ...config,
      queueName: 'trade.buy',
      concurrency: 3,
      enableIdempotency: true, // Enable signature deduplication
      enableDeadLetterQueue: true,
    });

    this.connection = connection;
  }

  protected async execute(
    data: TradeBuyJobData,
    context: JobContext
  ): Promise<TradeBuyJobResult> {
    const { runId, campaignId, walletId, amount } = data;

    context.logger.info({ amount, walletId }, 'Starting buy execution');

    await context.updateProgress(10, 'Fetching campaign details');

    // Get campaign details
    const { data: campaign, error: campaignError } = await context.supabase
      .from('campaigns')
      .select('*, pools(*), tokens(*)')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      context.logger.error({ error: campaignError?.message }, 'Campaign not found');
      throw new Error(`Campaign not found: ${campaignId}. Error: ${campaignError?.message}`);
    }

    context.logger.debug({ tokenMint: campaign.tokens.mint, poolId: campaign.pool_id }, 'Campaign details fetched');

    await context.updateProgress(20, 'Fetching wallet');

    // Get wallet
    const { data: wallet, error: walletError } = await context.supabase
      .from('wallets')
      .select('*')
      .eq('id', walletId)
      .single();

    if (walletError || !wallet || !wallet.encrypted_private_key) {
      context.logger.error({ error: walletError?.message }, 'Wallet not found or missing private key');
      throw new Error(`Wallet not found or has no private key: ${walletId}. Error: ${walletError?.message}`);
    }

    context.logger.debug({ walletAddress: wallet.public_key }, 'Wallet fetched');

    await context.updateProgress(30, 'Decrypting wallet');

    // Decrypt wallet
    const keypair = getKeypairFromEncrypted(Buffer.from(wallet.encrypted_private_key));

    await context.updateProgress(40, 'Loading user settings');

    // Load user settings for jito override
    let useJito = (campaign.params && campaign.params.useJito) || false;
    const { data: settings } = await context.supabase
      .from('user_settings')
      .select('jito_config')
      .eq('user_id', campaign.user_id)
      .single();

    if (settings && settings.jito_config && typeof settings.jito_config.useJito === 'boolean') {
      useJito = settings.jito_config.useJito;
    }

    await context.updateProgress(50, 'Executing buy transaction');

    // Prepare Jito configuration if needed
    let jitoConfig: TradingServiceConfig['jitoConfig'];
    if (useJito) {
      const jitoKey = settings?.jito_config?.jitoKey || process.env.JITO_KEY;
      const blockEngineUrl = settings?.jito_config?.blockEngineUrl || process.env.BLOCKENGINE_URL || 'https://mainnet.block-engine.jito.wtf';
      const jitoTipAmount = settings?.jito_config?.jitoFee || Number(process.env.JITO_FEE || 0.0001);

      if (!jitoKey) {
        throw new Error('Jito key is required when useJito is enabled');
      }

      jitoConfig = {
        blockEngineUrl,
        authKeypair: Keypair.fromSecretKey(bs58.decode(jitoKey)),
        tipAmount: jitoTipAmount,
        bundleTransactionLimit: 4,
        bundleTimeoutMs: 30000,
      };
    }

    // Create TradingService with executor configuration
    const tradingServiceConfig: TradingServiceConfig = {
      connection: this.connection,
      rpcEndpoint: process.env.RPC_ENDPOINT || '',
      rpcWebsocketEndpoint: process.env.RPC_WEBSOCKET_ENDPOINT || '',
      metricsService: this.metricsService,
      jitoConfig,
    };

    const tradingService = new TradingService(tradingServiceConfig);
    const poolId = new PublicKey(campaign.pools.pool_address);
    const baseMint = new PublicKey(campaign.tokens.mint);

    const result = await tradingService.executeBuy(
      keypair,
      baseMint,
      amount || 0.001,
      poolId,
      useJito
    );

    if (!result.success) {
      context.logger.error({ error: result.error }, 'Buy transaction failed');
      throw new Error(result.error || 'Buy transaction failed');
    }

    // Track transaction metrics
    if (this.metricsService) {
      this.metricsService.transactionsCounter.inc({
        campaign_id: campaignId || 'unknown',
        status: 'success',
        type: 'buy'
      });
    }

    context.logger.info({ signature: result.signature, useJito }, 'Buy transaction successful');

    await context.updateProgress(80, 'Checking idempotency');

    // Check idempotency - skip if already processed
    if (result.signature) {
      const alreadyProcessed = await context.checkIdempotency(result.signature);
      if (alreadyProcessed) {
        context.logger.warn('Transaction already processed, skipping');
        return { success: true, signature: result.signature };
      }
    }

    await context.updateProgress(90, 'Logging execution');

    // Log execution
    await context.supabase.from('executions').insert({
      job_id: data?.dbJobId || context.job.id,
      tx_signature: result.signature || 'bundled',
      result: { type: 'buy', amount, success: true },
    });

    // Mark as processed for idempotency
    if (result.signature) {
      await context.markProcessed(result.signature);
    }

    await context.updateProgress(100, 'Buy transaction completed');

    context.logger.info('Buy execution completed successfully');
    return { success: true, signature: result.signature };
  }
}
