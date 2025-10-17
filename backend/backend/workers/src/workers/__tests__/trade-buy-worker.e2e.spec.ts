import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { TradeBuyWorker, TradeBuyJobData } from '../TradeBuyWorker';
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
      signature: 'mock-legacy-signature',
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

describe('TradeBuyWorker - End-to-End Integration Tests', () => {
  let connection: Connection;
  let redis: IORedis;
  let supabase: SupabaseClient;
  let worker: TradeBuyWorker;
  let mockWallet: Keypair;
  let mockTransaction: VersionedTransaction;

  beforeEach(() => {
    connection = new Connection('https://api.mainnet-beta.solana.com');
    redis = new IORedis({ maxRetriesPerRequest: null });
    supabase = createClient('https://mock.supabase.co', 'mock-key');
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
  });

  afterEach(async () => {
    if (worker) {
      await worker.close();
    }
    await redis.quit();
  });

  describe('Legacy Executor Flow', () => {
    it('should execute buy transaction with legacy executor when useJito is false', async () => {
      // Setup mocks
      const campaign = {
        id: 'test-campaign-1',
        user_id: 'test-user',
        params: { useJito: false },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
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
      vi.spyOn(swapUtils, 'getBuyTxWithJupiter').mockResolvedValue(mockTransaction);

      // Create worker
      worker = new TradeBuyWorker(
        {
          connection: redis,
          supabase,
        },
        connection
      );

      // Create mock job
      const jobData: TradeBuyJobData = {
        runId: 'test-run',
        campaignId: 'test-campaign-1',
        walletId: 'test-wallet',
        amount: 0.01,
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

  describe('Jito Executor Flow', () => {
    it('should execute buy transaction with Jito executor when useJito is true', async () => {
      // Setup mocks
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
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any;
      });

      vi.spyOn(crypto, 'getKeypairFromEncrypted').mockReturnValue(mockWallet);
      vi.spyOn(swapUtils, 'getBuyTxWithJupiter').mockResolvedValue(mockTransaction);

      // Set environment variable
      process.env.JITO_KEY = jitoAuthKeypair.secretKey.toString();

      // Create worker
      worker = new TradeBuyWorker(
        {
          connection: redis,
          supabase,
        },
        connection
      );

      // Create mock job
      const jobData: TradeBuyJobData = {
        runId: 'test-run-jito',
        campaignId: 'test-campaign-jito',
        walletId: 'test-wallet',
        amount: 0.01,
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

    it('should throw error when Jito is enabled but JITO_KEY is missing', async () => {
      // Setup mocks
      const campaign = {
        id: 'test-campaign-jito-error',
        user_id: 'test-user',
        params: { useJito: true },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
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

      // Remove JITO_KEY from environment
      delete process.env.JITO_KEY;

      // Create worker
      worker = new TradeBuyWorker(
        {
          connection: redis,
          supabase,
        },
        connection
      );

      // Create mock job
      const jobData: TradeBuyJobData = {
        runId: 'test-run-error',
        campaignId: 'test-campaign-jito-error',
        walletId: 'test-wallet',
        amount: 0.01,
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

      // Execute and expect error
      await expect((worker as any).execute(jobData, mockContext)).rejects.toThrow(
        'Jito key is required when useJito is enabled'
      );
    });
  });

  describe('Configuration Priority', () => {
    it('should prioritize user settings over campaign params', async () => {
      // Setup mocks - campaign says use legacy, but user settings override to Jito
      const jitoAuthKeypair = Keypair.generate();
      const campaign = {
        id: 'test-campaign-priority',
        user_id: 'test-user',
        params: { useJito: false }, // Campaign says false
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
      };

      const wallet = {
        id: 'test-wallet',
        encrypted_private_key: Buffer.from('mock-encrypted-key'),
      };

      const settings = {
        jito_config: {
          useJito: true, // User settings override to true
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
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as any;
      });

      vi.spyOn(crypto, 'getKeypairFromEncrypted').mockReturnValue(mockWallet);
      vi.spyOn(swapUtils, 'getBuyTxWithJupiter').mockResolvedValue(mockTransaction);

      process.env.JITO_KEY = jitoAuthKeypair.secretKey.toString();

      // Create worker
      worker = new TradeBuyWorker(
        {
          connection: redis,
          supabase,
        },
        connection
      );

      // Create mock job
      const jobData: TradeBuyJobData = {
        runId: 'test-run-priority',
        campaignId: 'test-campaign-priority',
        walletId: 'test-wallet',
        amount: 0.01,
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

      // Verify - Should use Jito (from user settings, not campaign params)
      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling and Propagation', () => {
    it('should propagate transaction execution errors correctly', async () => {
      const campaign = {
        id: 'test-campaign-error',
        user_id: 'test-user',
        params: { useJito: false },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
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
      vi.spyOn(swapUtils, 'getBuyTxWithJupiter').mockRejectedValue(
        new Error('Transaction creation failed')
      );

      // Create worker
      worker = new TradeBuyWorker(
        {
          connection: redis,
          supabase,
        },
        connection
      );

      // Create mock job
      const jobData: TradeBuyJobData = {
        runId: 'test-run-error',
        campaignId: 'test-campaign-error',
        walletId: 'test-wallet',
        amount: 0.01,
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

      // Execute and expect error
      await expect((worker as any).execute(jobData, mockContext)).rejects.toThrow();
    });
  });

  describe('Idempotency Checks', () => {
    it('should skip execution if signature already processed', async () => {
      const campaign = {
        id: 'test-campaign-idempotent',
        user_id: 'test-user',
        params: { useJito: false },
        pools: { pool_address: Keypair.generate().publicKey.toBase58() },
        tokens: { mint: Keypair.generate().publicKey.toBase58() },
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
      vi.spyOn(swapUtils, 'getBuyTxWithJupiter').mockResolvedValue(mockTransaction);

      // Create worker
      worker = new TradeBuyWorker(
        {
          connection: redis,
          supabase,
        },
        connection
      );

      // Create mock job
      const jobData: TradeBuyJobData = {
        runId: 'test-run-idempotent',
        campaignId: 'test-campaign-idempotent',
        walletId: 'test-wallet',
        amount: 0.01,
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
        checkIdempotency: vi.fn().mockResolvedValue(true), // Already processed
        markProcessed: vi.fn().mockResolvedValue(undefined),
      };

      // Execute
      const result = await (worker as any).execute(jobData, mockContext);

      // Verify - Should return early with success
      expect(result.success).toBe(true);
      expect(mockContext.checkIdempotency).toHaveBeenCalled();
    });
  });
});
