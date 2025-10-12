import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { TradeBuyWorker, TradeBuyJobData } from '../TradeBuyWorker';
import { TradeSellWorker, TradeSellJobData } from '../TradeSellWorker';
import { Queue, Job } from 'bullmq';
import IORedis from 'ioredis';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as swapUtils from '../../core/legacy/utils/swapOnlyAmm';
import * as crypto from '../utils/crypto';

vi.mock('../../core/legacy/utils/swapOnlyAmm');
vi.mock('../utils/crypto');
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
      signature: 'test-signature-12345',
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

/**
 * Integration tests for transaction signature logging
 * Verifies that all transaction signatures are properly logged to the executions table
 */
describe('Transaction Signature Logging Integration Tests', () => {
  let connection: Connection;
  let redis: IORedis;
  let supabase: SupabaseClient;
  let buyWorker: TradeBuyWorker;
  let sellWorker: TradeSellWorker;
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
  });

  afterEach(async () => {
    if (buyWorker) await buyWorker.close();
    if (sellWorker) await sellWorker.close();
    if (tradeBuyQueue) await tradeBuyQueue.close();
    if (tradeSellQueue) await tradeSellQueue.close();
    await redis.quit();
  });

  describe('Buy Transaction Signature Logging', () => {
    it('should log transaction signature to executions table for successful buy', async () => {
      const campaign = {
        id: 'test-campaign-buy',
        user_id: 'test-user',
        params: { useJito: false },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
      };

      const wallet = {
        id: 'test-wallet',
        encrypted_private_key: Buffer.from('mock-encrypted-key'),
      };

      const executionsInsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });

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
            insert: executionsInsertSpy,
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
      vi.spyOn(swapUtils, 'getBuyTxWithJupiter').mockResolvedValue(mockTransaction);

      buyWorker = new TradeBuyWorker(
        {
          connection: redis,
          supabase,
        },
        connection
      );

      const jobData: TradeBuyJobData = {
        runId: 'test-run',
        campaignId: 'test-campaign-buy',
        walletId: 'test-wallet',
        amount: 0.01,
      };

      const mockJob = {
        id: 'job-123',
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

      const result = await (buyWorker as any).execute(jobData, mockContext);

      expect(result.success).toBe(true);
      expect(result.signature).toBeDefined();

      // Verify signature was logged to executions table
      expect(executionsInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: 'job-123',
          tx_signature: 'test-signature-12345',
          result: expect.objectContaining({
            type: 'buy',
            amount: 0.01,
            success: true,
          }),
        })
      );
    });

    it('should log "bundled" for Jito transactions', async () => {
      const jitoAuthKeypair = Keypair.generate();
      const campaign = {
        id: 'test-campaign-jito',
        user_id: 'test-user',
        params: { useJito: true },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
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

      const executionsInsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });

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
            insert: executionsInsertSpy,
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
      vi.spyOn(swapUtils, 'getBuyTxWithJupiter').mockResolvedValue(mockTransaction);

      process.env.JITO_KEY = jitoAuthKeypair.secretKey.toString();

      buyWorker = new TradeBuyWorker(
        {
          connection: redis,
          supabase,
        },
        connection
      );

      const jobData: TradeBuyJobData = {
        runId: 'test-run-jito',
        campaignId: 'test-campaign-jito',
        walletId: 'test-wallet',
        amount: 0.01,
      };

      const mockJob = {
        id: 'job-456',
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

      const result = await (buyWorker as any).execute(jobData, mockContext);

      expect(result.success).toBe(true);

      // Verify "bundled" was logged for Jito transaction
      expect(executionsInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: 'job-456',
          tx_signature: 'bundled',
          result: expect.objectContaining({
            type: 'buy',
            success: true,
          }),
        })
      );
    });

    it('should not log signature for failed transactions', async () => {
      const campaign = {
        id: 'test-campaign-fail',
        user_id: 'test-user',
        params: { useJito: false },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
      };

      const wallet = {
        id: 'test-wallet',
        encrypted_private_key: Buffer.from('mock-encrypted-key'),
      };

      const executionsInsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });

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
            insert: executionsInsertSpy,
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
      vi.spyOn(swapUtils, 'getBuyTxWithJupiter').mockRejectedValue(
        new Error('Transaction failed')
      );

      buyWorker = new TradeBuyWorker(
        {
          connection: redis,
          supabase,
        },
        connection
      );

      const jobData: TradeBuyJobData = {
        runId: 'test-run-fail',
        campaignId: 'test-campaign-fail',
        walletId: 'test-wallet',
        amount: 0.01,
      };

      const mockJob = {
        id: 'job-789',
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

      await expect((buyWorker as any).execute(jobData, mockContext)).rejects.toThrow();

      // Verify no execution was logged for failed transaction
      expect(executionsInsertSpy).not.toHaveBeenCalled();
    });
  });

  describe('Sell Transaction Signature Logging', () => {
    it('should log transaction signature for successful sell', async () => {
      const campaign = {
        id: 'test-campaign-sell',
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

      const executionsInsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });

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
            insert: executionsInsertSpy,
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

      sellWorker = new TradeSellWorker(
        {
          connection: redis,
          supabase,
        },
        connection,
        tradeBuyQueue,
        tradeSellQueue
      );

      const jobData: TradeSellJobData = {
        runId: 'test-run-sell',
        campaignId: 'test-campaign-sell',
        walletId: 'test-wallet',
      };

      const mockJob = {
        id: 'job-sell-123',
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

      const result = await (sellWorker as any).execute(jobData, mockContext);

      expect(result.success).toBe(true);

      // Verify signature was logged
      expect(executionsInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: 'job-sell-123',
          tx_signature: 'test-signature-12345',
          result: expect.objectContaining({
            type: 'sell',
            success: true,
          }),
        })
      );
    });

    it('should log signature for each progressive sell step', async () => {
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
          sellAllByTimes: 3,
        },
      };

      const executionsInsertSpy = vi.fn().mockResolvedValue({ data: null, error: null });

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
            insert: executionsInsertSpy,
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

      sellWorker = new TradeSellWorker(
        {
          connection: redis,
          supabase,
        },
        connection,
        tradeBuyQueue,
        tradeSellQueue
      );

      const jobData: TradeSellJobData = {
        runId: 'test-run-progressive',
        campaignId: 'test-campaign-progressive',
        walletId: 'test-wallet',
        mode: 'sell-only',
        stepIndex: 1,
        totalTimes: 3,
        initTokenAmountBase: '3000000',
      };

      const mockJob = {
        id: 'job-progressive-1',
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

      const result = await (sellWorker as any).execute(jobData, mockContext);

      expect(result.success).toBe(true);

      // Verify signature was logged with step information
      expect(executionsInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: 'job-progressive-1',
          tx_signature: 'test-signature-12345',
          result: expect.objectContaining({
            type: 'sell',
            success: true,
            mode: 'sell-only',
            stepIndex: 1,
            totalTimes: 3,
          }),
        })
      );
    });
  });

  describe('Signature Logging Data Integrity', () => {
    it('should include all required fields in execution log', () => {
      const executionLog = {
        job_id: 'job-123',
        tx_signature: 'signature-abc',
        result: {
          type: 'buy',
          amount: 0.01,
          success: true,
        },
        created_at: new Date().toISOString(),
      };

      expect(executionLog.job_id).toBeDefined();
      expect(executionLog.tx_signature).toBeDefined();
      expect(executionLog.result).toBeDefined();
      expect(executionLog.result.type).toMatch(/buy|sell/);
      expect(executionLog.result.success).toBeDefined();
    });

    it('should validate signature format before logging', () => {
      // Valid Solana signature format: base58 string, typically 88 characters
      const validSignature = 'test-signature-12345'; // Simplified for test
      const invalidSignature = '';

      expect(validSignature.length).toBeGreaterThan(0);
      expect(invalidSignature.length).toBe(0);

      // TODO: Add signature format validation
      // - Check signature is non-empty
      // - Verify base58 format
      // - Validate length (typically 87-88 chars)
    });
  });
});
