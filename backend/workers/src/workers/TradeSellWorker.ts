import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { Queue } from 'bullmq';
import { BaseWorker, BaseWorkerConfig, JobContext } from './BaseWorker';
import { TradeJobPayload, QueueNames } from '../types';
import { TradingService, TradingServiceConfig } from '../core/legacy/services/trading-service';
import { getKeypairFromEncrypted } from './utils/crypto';
import * as bs58 from 'bs58';

export interface TradeSellJobData extends TradeJobPayload {
  runId?: string;
  campaignId?: string;
  walletId?: string;
  mode?: string;
  stepIndex?: number;
  totalTimes?: number;
  initTokenAmountBase?: string;
  dbJobId?: string;
}

export interface TradeSellJobResult {
  success: boolean;
  signature?: string;
}

export class TradeSellWorker extends BaseWorker<TradeSellJobData, TradeSellJobResult> {
  private connection: Connection;
  private tradeBuyQueue: Queue;
  private tradeSellQueue: Queue;

  constructor(
    config: Omit<BaseWorkerConfig, 'queueName'>,
    connection: Connection,
    tradeBuyQueue: Queue,
    tradeSellQueue: Queue
  ) {
    super({
      ...config,
      queueName: 'trade.sell',
      concurrency: 3,
      enableIdempotency: true,
      enableDeadLetterQueue: true,
    });

    this.connection = connection;
    this.tradeBuyQueue = tradeBuyQueue;
    this.tradeSellQueue = tradeSellQueue;
  }

  protected async execute(
    data: TradeSellJobData,
    context: JobContext
  ): Promise<TradeSellJobResult> {
    const { runId, campaignId, walletId, mode, stepIndex, totalTimes, initTokenAmountBase } = data;

    await context.updateProgress(10, 'Fetching campaign details');

    // Get campaign details
    const { data: campaign, error: campaignError } = await context.supabase
      .from('campaigns')
      .select('*, pools(*), tokens(*)')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error(`Campaign not found: ${campaignId}. Error: ${campaignError?.message}`);
    }

    await context.updateProgress(20, 'Fetching wallet');

    // Get wallet
    const { data: wallet, error: walletError } = await context.supabase
      .from('wallets')
      .select('*')
      .eq('id', walletId)
      .single();

    if (walletError || !wallet || !wallet.encrypted_private_key) {
      throw new Error(`Wallet not found or has no private key: ${walletId}. Error: ${walletError?.message}`);
    }

    await context.updateProgress(30, 'Decrypting wallet');

    // Decrypt wallet
    const keypair = getKeypairFromEncrypted(Buffer.from(wallet.encrypted_private_key));

    await context.updateProgress(40, 'Loading user settings');

    // Load per-user settings
    const { data: settings } = await context.supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', campaign.user_id)
      .single();

    const sellCfg = (settings && settings.sell_config) || {};

    // Determine if Jito should be used
    let useJito = (campaign.params && campaign.params.useJito) || false;
    if (settings && settings.jito_config && typeof settings.jito_config.useJito === 'boolean') {
      useJito = settings.jito_config.useJito;
    }

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
      jitoConfig,
    };

    const tradingService = new TradingService(tradingServiceConfig);
    const poolId = new PublicKey(campaign.pools.pool_address);
    const baseMint = new PublicKey(campaign.tokens.mint);

    // Handle sell-only progressive mode
    if (mode === 'sell-only') {
      return await this.handleProgressiveSell(
        context,
        data,
        tradingService,
        keypair,
        baseMint,
        poolId,
        useJito,
        sellCfg
      );
    }

    // Handle normal loop sell
    return await this.handleNormalSell(
      context,
      data,
      tradingService,
      keypair,
      baseMint,
      poolId,
      useJito,
      sellCfg,
      campaign
    );
  }

  private async handleProgressiveSell(
    context: JobContext,
    data: TradeSellJobData,
    tradingService: TradingService,
    keypair: Keypair,
    baseMint: PublicKey,
    poolId: PublicKey,
    useJito: boolean,
    sellCfg: any
  ): Promise<TradeSellJobResult> {
    const { runId, campaignId, walletId, stepIndex, totalTimes, initTokenAmountBase } = data;

    await context.updateProgress(50, 'Progressive sell mode - calculating amounts');

    const times = Number(totalTimes ?? sellCfg.sellAllByTimes ?? process.env.SELL_ALL_BY_TIMES ?? 1);
    const currentStep = Number(stepIndex ?? 1);

    // Determine initial token amount (base units)
    let initBase: bigint;
    if (initTokenAmountBase) {
      initBase = BigInt(initTokenAmountBase);
    } else {
      const ata = await getAssociatedTokenAddress(baseMint, keypair.publicKey);
      const bal = await this.connection.getTokenAccountBalance(ata, 'confirmed');
      initBase = BigInt(bal.value.amount || '0');
    }

    const targetRemaining = (initBase * BigInt(times - currentStep)) / BigInt(times);
    const ataNow = await getAssociatedTokenAddress(baseMint, keypair.publicKey);
    const balNow = await this.connection.getTokenAccountBalance(ataNow, 'confirmed');
    const currentBase = BigInt(balNow.value.amount || '0');
    const toSell = currentBase > targetRemaining ? currentBase - targetRemaining : BigInt(0);

    await context.updateProgress(70, `Executing progressive sell step ${currentStep}/${times}`);

    const progResult = await tradingService.executeSell(
      keypair,
      baseMint,
      poolId,
      useJito,
      { tokenAmountBase: toSell.toString() }
    );

    if (!progResult.success) {
      throw new Error(progResult.error || 'Sell transaction failed');
    }

    // Check idempotency
    if (progResult.signature) {
      const alreadyProcessed = await context.checkIdempotency(progResult.signature);
      if (alreadyProcessed) {
        return { success: true, signature: progResult.signature };
      }
    }

    await context.updateProgress(85, 'Logging execution');

    // Log execution
    await context.supabase.from('executions').insert({
      job_id: data?.dbJobId || context.job.id,
      tx_signature: progResult.signature || 'bundled',
      result: {
        type: 'sell',
        success: true,
        mode: 'sell-only',
        stepIndex: currentStep,
        totalTimes: times
      },
    });

    // Mark as processed
    if (progResult.signature) {
      await context.markProcessed(progResult.signature);
    }

    // Enqueue next progressive sell step if pending
    if (currentStep < times) {
      await context.updateProgress(95, `Scheduling next progressive sell step ${currentStep + 1}/${times}`);

      const { data: sellJobRow } = await context.supabase
        .from('jobs')
        .insert({
          run_id: runId,
          queue: QueueNames.TRADE_SELL,
          type: 'sell-token',
          payload: {
            campaignId,
            walletId,
            mode: 'sell-only',
            stepIndex: currentStep + 1,
            totalTimes: times
          },
          status: 'queued',
        })
        .select()
        .single();

      await this.tradeSellQueue.add(
        'sell-token',
        {
          runId,
          campaignId,
          walletId,
          mode: 'sell-only',
          stepIndex: currentStep + 1,
          totalTimes: times,
          initTokenAmountBase: initBase.toString(),
          dbJobId: sellJobRow?.id,
        },
        { delay: 3000 }
      );
    }

    await context.updateProgress(100, `Progressive sell step ${currentStep}/${times} completed`);

    return { success: true, signature: progResult.signature };
  }

  private async handleNormalSell(
    context: JobContext,
    data: TradeSellJobData,
    tradingService: TradingService,
    keypair: Keypair,
    baseMint: PublicKey,
    poolId: PublicKey,
    useJito: boolean,
    sellCfg: any,
    campaign: any
  ): Promise<TradeSellJobResult> {
    const { runId, campaignId, walletId, mode } = data;

    await context.updateProgress(50, 'Normal sell mode - executing sell');

    // Normal loop sell with optional percent from settings
    const percentCfg = sellCfg.percent != null ? Number(sellCfg.percent) : 100;
    const options = percentCfg >= 100 ? undefined : {
      percent: Math.max(1, Math.min(100, percentCfg))
    };

    const result = await tradingService.executeSell(
      keypair,
      baseMint,
      poolId,
      useJito,
      options
    );

    if (!result.success) {
      throw new Error(result.error || 'Sell transaction failed');
    }

    // Check idempotency
    if (result.signature) {
      const alreadyProcessed = await context.checkIdempotency(result.signature);
      if (alreadyProcessed) {
        return { success: true, signature: result.signature };
      }
    }

    await context.updateProgress(70, 'Logging execution');

    // Log execution
    await context.supabase.from('executions').insert({
      job_id: data?.dbJobId || context.job.id,
      tx_signature: result.signature || 'bundled',
      result: { type: 'sell', success: true, percent: options?.percent ?? 100 },
    });

    // Mark as processed
    if (result.signature) {
      await context.markProcessed(result.signature);
    }

    await context.updateProgress(80, 'Checking campaign status');

    // Schedule next buy/sell cycle if campaign is still active
    const { data: campaignStatus } = await context.supabase
      .from('campaigns')
      .select('status, params')
      .eq('id', campaignId)
      .single();

    if (campaignStatus && campaignStatus.status === 'active' && mode !== 'sell-only') {
      await this.scheduleNextCycle(context, data, campaign);
    }

    await context.updateProgress(100, 'Sell transaction completed');

    return { success: true, signature: result.signature };
  }

  private async scheduleNextCycle(
    context: JobContext,
    data: TradeSellJobData,
    campaign: any
  ): Promise<void> {
    const { runId, campaignId, walletId } = data;

    // Determine randomized amount and delays
    const params = campaign.params || {};

    // Fetch per-user settings to override defaults
    const { data: owner } = await context.supabase
      .from('campaigns')
      .select('user_id')
      .eq('id', campaignId)
      .single();

    let settings: any = null;
    if (owner?.user_id) {
      const { data: s } = await context.supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', owner.user_id)
        .single();
      settings = s || null;
    }

    const tradingCfg = settings?.trading_config || {};
    const minAmount = Number(tradingCfg.buyLowerAmount ?? params.minTxSize ?? process.env.BUY_LOWER_AMOUNT ?? 0.001);
    const maxAmount = Number(tradingCfg.buyUpperAmount ?? params.maxTxSize ?? process.env.BUY_UPPER_AMOUNT ?? 0.002);
    const minInterval = Number(tradingCfg.buyIntervalMin ?? params.buyIntervalMin ?? process.env.BUY_INTERVAL_MIN ?? 2000);
    const maxInterval = Number(tradingCfg.buyIntervalMax ?? params.buyIntervalMax ?? process.env.BUY_INTERVAL_MAX ?? 4000);

    const nextAmount = Number((Math.random() * (maxAmount - minAmount) + minAmount).toFixed(6));
    const buyDelay = Math.round(Math.random() * (maxInterval - minInterval) + minInterval);
    const sellDelay = buyDelay + 3000; // at least 3s after buy

    // Create DB job for next buy
    const { data: jobRow } = await context.supabase
      .from('jobs')
      .insert({
        run_id: runId,
        queue: QueueNames.TRADE_BUY,
        type: 'buy-token',
        payload: { campaignId, walletId, amount: nextAmount },
        status: 'queued',
      })
      .select()
      .single();

    // Enqueue next buy job with dbJobId
    await this.tradeBuyQueue.add(
      'buy-token',
      {
        runId,
        campaignId,
        walletId,
        amount: nextAmount,
        dbJobId: jobRow?.id,
      },
      { delay: buyDelay }
    );

    // Create DB job for next sell
    const { data: sellJobRow } = await context.supabase
      .from('jobs')
      .insert({
        run_id: runId,
        queue: QueueNames.TRADE_SELL,
        type: 'sell-token',
        payload: { campaignId, walletId },
        status: 'queued',
      })
      .select()
      .single();

    // Enqueue next sell job after delay
    await this.tradeSellQueue.add(
      'sell-token',
      { runId, campaignId, walletId, dbJobId: sellJobRow?.id },
      { delay: sellDelay }
    );
  }
}
