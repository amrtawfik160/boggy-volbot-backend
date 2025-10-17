import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { TradeSellWorker, TradeSellJobData } from '../TradeSellWorker';
import { Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as swapUtils from '../../core/legacy/utils/swapOnlyAmm';
import * as crypto from '../utils/crypto';
import { getAssociatedTokenAddress } from '@solana/spl-token';

vi.mock('../../core/legacy/utils/swapOnlyAmm');
vi.mock('../utils/crypto');
vi.mock('@solana/spl-token');
vi.mock('../../core/legacy/utils/logger', () => ({
  tradeLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('../../core/legacy/utils/utils', () => ({
  globalRateLimiter: {
    waitForSlot: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock the executor modules
vi.mock('../../core/legacy/executor/legacy-executor', () => ({
  LegacyExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      signature: 'mock-legacy-sell-signature',
    }),
    executeBatch: vi.fn(),
  })),
}));

vi.mock('../../core/legacy/executor/jito-executor', () => ({
  JitoExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      success: true,
      signature: 'bundled',
    }),
    executeBatch: vi.fn(),
  })),
}));

describe('TradeSellWorker - End-to-End Integration Tests', () => {
  let connection: Connection;
  let redis: IORedis;
  let supabase: SupabaseClient;
  let worker: TradeSellWorker;
  let tradeBuyQueue: Queue;
  let tradeSellQueue: Queue;
  let mockWallet: Keypair;
  let mockTransaction: VersionedTransaction;

  beforeEach(() => {
    connection = new Connection('https://api.mainnet-beta.solana.com');
    redis = new IORedis({ maxRetriesPerRequest: null });
    supabase = createClient('https://mock.supabase.co', 'mock-key');
    tradeBuyQueue = new Queue('trade.buy', { connection: redis as any });
    tradeSellQueue = new Queue('trade.sell', { connection: redis as any });
    mockWallet = Keypair.generate();
    mockTransaction = {} as VersionedTransaction;

    vi.clearAllMocks();

    // Mock Supabase responses
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    } as any);

    // Mock getAssociatedTokenAddress
    vi.mocked(getAssociatedTokenAddress).mockResolvedValue(Keypair.generate().publicKey);

    // Mock connection methods
    vi.spyOn(connection, 'getTokenAccountBalance').mockResolvedValue({
      context: { slot: 0 },
      value: {
        amount: '1000000',
        decimals: 6,
        uiAmount: 1,
        uiAmountString: '1',
      },
    } as any);
  });

  afterEach(async () => {
    if (worker) {
      await worker.close();
    }
    await tradeBuyQueue.close();
    await tradeSellQueue.close();
    await redis.quit();
  });

  describe('Legacy Executor Flow - Normal Sell', () => {
    it('should execute normal sell with legacy executor when useJito is false', async () => {
      const campaign = {
        id: 'test-campaign-sell-legacy',
        user_id: 'test-user',
        params: { useJito: false },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
        status: 'active',
      };

      const wallet = {
        id: 'test-wallet',
        encrypted_private_key: Buffer.from('mock-encrypted-key'),
      };

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'campaigns') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
          } as any;
        }
        if (table === 'wallets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: wallet, error: null }),
          } as any;
        }
        if (table === 'user_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }
        if (table === 'executions') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }
        if (table === 'jobs') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'job-1' }, error: null }),
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any;
      });

      vi.spyOn(crypto, 'getKeypairFromEncrypted').mockReturnValue(mockWallet);
      vi.spyOn(swapUtils, 'getSellTxWithJupiter').mockResolvedValue(mockTransaction);
      vi.spyOn(tradeBuyQueue, 'add').mockResolvedValue({} as any);
      vi.spyOn(tradeSellQueue, 'add').mockResolvedValue({} as any);

      // Create worker
      worker = new TradeSellWorker(
        {
          connection: redis,
          supabase,
        },
        connection,
        tradeBuyQueue,
        tradeSellQueue
      );

      // Create mock job
      const jobData: TradeSellJobData = {
        runId: 'test-run-sell',
        campaignId: 'test-campaign-sell-legacy',
        walletId: 'test-wallet',
      };

      const mockJob = {
        id: '1',
        data: jobData,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      } as unknown as Job;

      const mockContext = {
        job: mockJob,
        supabase,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        checkIdempotency: vi.fn().mockResolvedValue(false),
        markProcessed: vi.fn().mockResolvedValue(undefined),
      };

      // Execute
      const result = await (worker as any).execute(jobData, mockContext);

      // Verify
      expect(result.success).toBe(true);
      expect(result.signature).toBeDefined();
      expect(mockContext.updateProgress).toHaveBeenCalled();
    });
  });

  describe('Jito Executor Flow - Normal Sell', () => {
    it('should execute normal sell with Jito executor when useJito is true', async () => {
      const jitoAuthKeypair = Keypair.generate();
      const campaign = {
        id: 'test-campaign-sell-jito',
        user_id: 'test-user',
        params: { useJito: true },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
        status: 'active',
      };

      const wallet = {
        id: 'test-wallet',
        encrypted_private_key: Buffer.from('mock-encrypted-key'),
      };

      const settings = {
        jito_config: {
          useJito: true,
          jitoKey: jitoAuthKeypair.secretKey.toString(),
          blockEngineUrl: 'https://mainnet.block-engine.jito.wtf',
          jitoFee: 0.0001,
        },
      };

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'campaigns') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
          } as any;
        }
        if (table === 'wallets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: wallet, error: null }),
          } as any;
        }
        if (table === 'user_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: settings, error: null }),
          } as any;
        }
        if (table === 'executions') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }
        if (table === 'jobs') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'job-jito' }, error: null }),
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any;
      });

      vi.spyOn(crypto, 'getKeypairFromEncrypted').mockReturnValue(mockWallet);
      vi.spyOn(swapUtils, 'getSellTxWithJupiter').mockResolvedValue(mockTransaction);
      vi.spyOn(tradeBuyQueue, 'add').mockResolvedValue({} as any);
      vi.spyOn(tradeSellQueue, 'add').mockResolvedValue({} as any);

      process.env.JITO_KEY = jitoAuthKeypair.secretKey.toString();

      // Create worker
      worker = new TradeSellWorker(
        {
          connection: redis,
          supabase,
        },
        connection,
        tradeBuyQueue,
        tradeSellQueue
      );

      // Create mock job
      const jobData: TradeSellJobData = {
        runId: 'test-run-sell-jito',
        campaignId: 'test-campaign-sell-jito',
        walletId: 'test-wallet',
      };

      const mockJob = {
        id: '2',
        data: jobData,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      } as unknown as Job;

      const mockContext = {
        job: mockJob,
        supabase,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        checkIdempotency: vi.fn().mockResolvedValue(false),
        markProcessed: vi.fn().mockResolvedValue(undefined),
      };

      // Execute
      const result = await (worker as any).execute(jobData, mockContext);

      // Verify
      expect(result.success).toBe(true);
      expect(mockContext.updateProgress).toHaveBeenCalled();
    });
  });

  describe('Progressive Sell Mode', () => {
    it('should handle progressive sell with correct amount calculations', async () => {
      const campaign = {
        id: 'test-campaign-progressive',
        user_id: 'test-user',
        params: { useJito: false },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
        status: 'active',
      };

      const wallet = {
        id: 'test-wallet',
        encrypted_private_key: Buffer.from('mock-encrypted-key'),
      };

      const settings = {
        sell_config: {
          sellAllByTimes: 5, // Sell in 5 steps
        },
      };

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'campaigns') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
          } as any;
        }
        if (table === 'wallets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: wallet, error: null }),
          } as any;
        }
        if (table === 'user_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: settings, error: null }),
          } as any;
        }
        if (table === 'executions') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }
        if (table === 'jobs') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'job-progressive' }, error: null }),
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any;
      });

      vi.spyOn(crypto, 'getKeypairFromEncrypted').mockReturnValue(mockWallet);
      vi.spyOn(swapUtils, 'getSellTxWithJupiter').mockResolvedValue(mockTransaction);
      vi.spyOn(tradeSellQueue, 'add').mockResolvedValue({} as any);

      // Create worker
      worker = new TradeSellWorker(
        {
          connection: redis,
          supabase,
        },
        connection,
        tradeBuyQueue,
        tradeSellQueue
      );

      // Create mock job for step 1 of 5
      const jobData: TradeSellJobData = {
        runId: 'test-run-progressive',
        campaignId: 'test-campaign-progressive',
        walletId: 'test-wallet',
        mode: 'sell-only',
        stepIndex: 1,
        totalTimes: 5,
        initTokenAmountBase: '5000000', // 5M base units
      };

      const mockJob = {
        id: '3',
        data: jobData,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      } as unknown as Job;

      const mockContext = {
        job: mockJob,
        supabase,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        checkIdempotency: vi.fn().mockResolvedValue(false),
        markProcessed: vi.fn().mockResolvedValue(undefined),
      };

      // Execute
      const result = await (worker as any).execute(jobData, mockContext);

      // Verify
      expect(result.success).toBe(true);
      expect(mockContext.updateProgress).toHaveBeenCalled();
      // Should schedule next progressive sell step
      expect(tradeSellQueue.add).toHaveBeenCalledWith(
        'sell-token',
        expect.objectContaining({
          mode: 'sell-only',
          stepIndex: 2,
          totalTimes: 5,
        }),
        expect.any(Object)
      );
    });

    it('should not schedule next step when on final progressive sell', async () => {
      const campaign = {
        id: 'test-campaign-progressive-final',
        user_id: 'test-user',
        params: { useJito: false },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
        status: 'active',
      };

      const wallet = {
        id: 'test-wallet',
        encrypted_private_key: Buffer.from('mock-encrypted-key'),
      };

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'campaigns') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
          } as any;
        }
        if (table === 'wallets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: wallet, error: null }),
          } as any;
        }
        if (table === 'user_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }
        if (table === 'executions') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any;
      });

      vi.spyOn(crypto, 'getKeypairFromEncrypted').mockReturnValue(mockWallet);
      vi.spyOn(swapUtils, 'getSellTxWithJupiter').mockResolvedValue(mockTransaction);
      vi.spyOn(tradeSellQueue, 'add').mockResolvedValue({} as any);

      // Create worker
      worker = new TradeSellWorker(
        {
          connection: redis,
          supabase,
        },
        connection,
        tradeBuyQueue,
        tradeSellQueue
      );

      // Create mock job for final step (5 of 5)
      const jobData: TradeSellJobData = {
        runId: 'test-run-progressive-final',
        campaignId: 'test-campaign-progressive-final',
        walletId: 'test-wallet',
        mode: 'sell-only',
        stepIndex: 5,
        totalTimes: 5,
        initTokenAmountBase: '5000000',
      };

      const mockJob = {
        id: '4',
        data: jobData,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      } as unknown as Job;

      const mockContext = {
        job: mockJob,
        supabase,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        checkIdempotency: vi.fn().mockResolvedValue(false),
        markProcessed: vi.fn().mockResolvedValue(undefined),
      };

      // Execute
      const result = await (worker as any).execute(jobData, mockContext);

      // Verify
      expect(result.success).toBe(true);
      // Should NOT schedule next step since we're on the final step
      expect(tradeSellQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('Next Cycle Scheduling', () => {
    it('should schedule next buy/sell cycle when campaign is active', async () => {
      const campaign = {
        id: 'test-campaign-cycle',
        user_id: 'test-user',
        params: {
          useJito: false,
          minTxSize: 0.001,
          maxTxSize: 0.002,
          buyIntervalMin: 2000,
          buyIntervalMax: 4000,
        },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
        status: 'active',
      };

      const wallet = {
        id: 'test-wallet',
        encrypted_private_key: Buffer.from('mock-encrypted-key'),
      };

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'campaigns') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
          } as any;
        }
        if (table === 'wallets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: wallet, error: null }),
          } as any;
        }
        if (table === 'user_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }
        if (table === 'executions') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }
        if (table === 'jobs') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'job-cycle' }, error: null }),
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any;
      });

      vi.spyOn(crypto, 'getKeypairFromEncrypted').mockReturnValue(mockWallet);
      vi.spyOn(swapUtils, 'getSellTxWithJupiter').mockResolvedValue(mockTransaction);
      vi.spyOn(tradeBuyQueue, 'add').mockResolvedValue({} as any);
      vi.spyOn(tradeSellQueue, 'add').mockResolvedValue({} as any);

      // Create worker
      worker = new TradeSellWorker(
        {
          connection: redis,
          supabase,
        },
        connection,
        tradeBuyQueue,
        tradeSellQueue
      );

      // Create mock job
      const jobData: TradeSellJobData = {
        runId: 'test-run-cycle',
        campaignId: 'test-campaign-cycle',
        walletId: 'test-wallet',
      };

      const mockJob = {
        id: '5',
        data: jobData,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      } as unknown as Job;

      const mockContext = {
        job: mockJob,
        supabase,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        checkIdempotency: vi.fn().mockResolvedValue(false),
        markProcessed: vi.fn().mockResolvedValue(undefined),
      };

      // Execute
      const result = await (worker as any).execute(jobData, mockContext);

      // Verify
      expect(result.success).toBe(true);
      // Should schedule next buy and sell
      expect(tradeBuyQueue.add).toHaveBeenCalledWith(
        'buy-token',
        expect.objectContaining({
          campaignId: 'test-campaign-cycle',
          walletId: 'test-wallet',
        }),
        expect.objectContaining({ delay: expect.any(Number) })
      );
      expect(tradeSellQueue.add).toHaveBeenCalledWith(
        'sell-token',
        expect.objectContaining({
          campaignId: 'test-campaign-cycle',
          walletId: 'test-wallet',
        }),
        expect.objectContaining({ delay: expect.any(Number) })
      );
    });

    it('should not schedule next cycle when campaign is inactive', async () => {
      const campaign = {
        id: 'test-campaign-inactive',
        user_id: 'test-user',
        params: { useJito: false },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
        status: 'paused', // Campaign is paused
      };

      const wallet = {
        id: 'test-wallet',
        encrypted_private_key: Buffer.from('mock-encrypted-key'),
      };

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'campaigns') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
          } as any;
        }
        if (table === 'wallets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: wallet, error: null }),
          } as any;
        }
        if (table === 'user_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }
        if (table === 'executions') {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any;
      });

      vi.spyOn(crypto, 'getKeypairFromEncrypted').mockReturnValue(mockWallet);
      vi.spyOn(swapUtils, 'getSellTxWithJupiter').mockResolvedValue(mockTransaction);
      vi.spyOn(tradeBuyQueue, 'add').mockResolvedValue({} as any);
      vi.spyOn(tradeSellQueue, 'add').mockResolvedValue({} as any);

      // Create worker
      worker = new TradeSellWorker(
        {
          connection: redis,
          supabase,
        },
        connection,
        tradeBuyQueue,
        tradeSellQueue
      );

      // Create mock job
      const jobData: TradeSellJobData = {
        runId: 'test-run-inactive',
        campaignId: 'test-campaign-inactive',
        walletId: 'test-wallet',
      };

      const mockJob = {
        id: '6',
        data: jobData,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      } as unknown as Job;

      const mockContext = {
        job: mockJob,
        supabase,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        checkIdempotency: vi.fn().mockResolvedValue(false),
        markProcessed: vi.fn().mockResolvedValue(undefined),
      };

      // Execute
      const result = await (worker as any).execute(jobData, mockContext);

      // Verify
      expect(result.success).toBe(true);
      // Should NOT schedule next cycle
      expect(tradeBuyQueue.add).not.toHaveBeenCalled();
      expect(tradeSellQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors correctly when sell fails', async () => {
      const campaign = {
        id: 'test-campaign-sell-error',
        user_id: 'test-user',
        params: { useJito: false },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
        status: 'active',
      };

      const wallet = {
        id: 'test-wallet',
        encrypted_private_key: Buffer.from('mock-encrypted-key'),
      };

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'campaigns') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
          } as any;
        }
        if (table === 'wallets') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: wallet, error: null }),
          } as any;
        }
        if (table === 'user_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any;
      });

      vi.spyOn(crypto, 'getKeypairFromEncrypted').mockReturnValue(mockWallet);
      vi.spyOn(swapUtils, 'getSellTxWithJupiter').mockRejectedValue(
        new Error('Sell transaction creation failed')
      );

      // Create worker
      worker = new TradeSellWorker(
        {
          connection: redis,
          supabase,
        },
        connection,
        tradeBuyQueue,
        tradeSellQueue
      );

      // Create mock job
      const jobData: TradeSellJobData = {
        runId: 'test-run-sell-error',
        campaignId: 'test-campaign-sell-error',
        walletId: 'test-wallet',
      };

      const mockJob = {
        id: '7',
        data: jobData,
        updateProgress: vi.fn().mockResolvedValue(undefined),
      } as unknown as Job;

      const mockContext = {
        job: mockJob,
        supabase,
        updateProgress: vi.fn().mockResolvedValue(undefined),
        checkIdempotency: vi.fn().mockResolvedValue(false),
        markProcessed: vi.fn().mockResolvedValue(undefined),
      };

      // Execute and expect error
      await expect((worker as any).execute(jobData, mockContext)).rejects.toThrow();
    });
  });
});
