import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistributeWorker, DistributeJobData } from '../DistributeWorker';
import { SupabaseClient } from '@supabase/supabase-js';
import { Connection, Keypair } from '@solana/web3.js';
import IORedis from 'ioredis';
import { Job, Queue } from 'bullmq';
import bs58 from 'bs58';
import { DistributionService } from '../core/legacy/services/distribution-service';

// Mock dependencies
vi.mock('ioredis');
vi.mock('@supabase/supabase-js');
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn(),
  })),
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    close: vi.fn(),
  })),
}));

// Create a mock distributeSol function that we can control
const mockDistributeSol = vi.fn();

vi.mock('../core/legacy/services/distribution-service', () => ({
  DistributionService: vi.fn().mockImplementation(() => ({
    distributeSol: mockDistributeSol,
  })),
}));

vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual<typeof import('@solana/web3.js')>('@solana/web3.js');
  return {
    ...actual,
    sendAndConfirmTransaction: vi.fn().mockResolvedValue('mock-signature'),
  };
});

vi.mock('../utils/crypto', () => ({
  getKeypairFromEncrypted: vi.fn((buf: Buffer) => {
    return Keypair.generate();
  }),
  encryptPrivateKey: vi.fn((key: string) => {
    return Buffer.from('encrypted-' + key);
  }),
  decryptPrivateKey: vi.fn((buf: Buffer) => {
    const mockKp = Keypair.generate();
    return bs58.encode(mockKp.secretKey);
  }),
}));

describe('DistributeWorker', () => {
  let distributeWorker: DistributeWorker;
  let mockSupabase: any;
  let mockConnection: Connection;
  let mockRedis: IORedis;
  let mockTradeBuyQueue: Queue;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset the mockDistributeSol function
    mockDistributeSol.mockReset();

    // Create mock Supabase client with proper query builder chain
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      insert: vi.fn().mockReturnThis(),
    };

    mockRedis = new IORedis();
    mockConnection = {
      getBalance: vi.fn().mockResolvedValue(1_000_000_000), // 1 SOL in lamports
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: 'mock-blockhash', lastValidBlockHeight: 1000 }),
      getRecentBlockhash: vi.fn().mockResolvedValue({ blockhash: 'mock-blockhash', feeCalculator: { lamportsPerSignature: 5000 } }),
      getMinimumBalanceForRentExemption: vi.fn().mockResolvedValue(890880),
      sendRawTransaction: vi.fn().mockResolvedValue('mock-signature'),
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    } as any;
    mockTradeBuyQueue = new Queue('trade.buy', { connection: mockRedis });

    distributeWorker = new DistributeWorker(
      {
        connection: mockRedis,
        supabase: mockSupabase as unknown as SupabaseClient,
      },
      mockConnection,
      mockTradeBuyQueue
    );
  });

  describe('Distribution Process', () => {
    it('should successfully distribute SOL to multiple wallets', async () => {
      const mockCampaign = {
        id: 'campaign-123',
        user_id: 'user-456',
      };

      const mockWallets = [
        {
          id: '1',
          address: 'main-wallet',
          encrypted_private_key: Buffer.from('main-key'),
          is_active: true,
        },
      ];

      const mockGeneratedWallets = [
        {
          kp: Keypair.generate(),
          buyAmount: 0.1,
          signature: 'sig-1',
        },
        {
          kp: Keypair.generate(),
          buyAmount: 0.15,
          signature: 'sig-2',
        },
      ];

      // First query: .from().select().eq().single() for campaign
      mockSupabase.eq.mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({
          data: mockCampaign,
          error: null,
        }),
      });

      // Second query: .from().select().eq().eq() for wallets
      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: mockWallets,
          error: null,
        }),
      });

      // Mock distribution service
      mockDistributeSol.mockResolvedValueOnce({
        success: true,
        wallets: mockGeneratedWallets,
        failed: 0,
      });

      // Mock wallet insert - return success for each insert
      mockSupabase.insert.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-123' },
          error: null,
        }),
      });

      // Mock wallet id query after insert
      mockSupabase.eq.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'wallet-new-123' },
          error: null,
        }),
      });

      const result = await (distributeWorker as any).execute(
        { campaignId: 'campaign-123', distributionNum: 2, runId: 'run-123' } as DistributeJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(result.success).toBe(true);
      expect(result.distributedWallets).toBe(2);
      expect(mockDistributeSol).toHaveBeenCalledWith(expect.any(Keypair), 2);
    });

    it('should handle campaign not found error', async () => {
      mockSupabase.eq.mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({
          data: null,
          error: { message: 'Campaign not found' },
        }),
      });

      await expect(
        (distributeWorker as any).execute(
          { campaignId: 'invalid', distributionNum: 5 } as DistributeJobData,
          {
            supabase: mockSupabase,
            updateProgress: vi.fn(),
            job: {} as Job,
            checkIdempotency: vi.fn(),
            markProcessed: vi.fn(),
          }
        )
      ).rejects.toThrow('Campaign not found');
    });

    it('should handle no active wallets error', async () => {
      const mockCampaign = { id: 'campaign-123', user_id: 'user-456' };

      // First query: campaign
      mockSupabase.eq.mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({
          data: mockCampaign,
          error: null,
        }),
      });

      // Second query: wallets (empty)
      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      });

      await expect(
        (distributeWorker as any).execute(
          { campaignId: 'campaign-123', distributionNum: 5 } as DistributeJobData,
          {
            supabase: mockSupabase,
            updateProgress: vi.fn(),
            job: {} as Job,
            checkIdempotency: vi.fn(),
            markProcessed: vi.fn(),
          }
        )
      ).rejects.toThrow('No active wallets available');
    });

    it('should handle main wallet without private key', async () => {
      const mockCampaign = { id: 'campaign-123', user_id: 'user-456' };
      const mockWallets = [
        {
          id: '1',
          address: 'main-wallet',
          encrypted_private_key: null, // No private key
          is_active: true,
        },
      ];

      mockSupabase.eq.mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({
          data: mockCampaign,
          error: null,
        }),
      });

      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: mockWallets,
          error: null,
        }),
      });

      await expect(
        (distributeWorker as any).execute(
          { campaignId: 'campaign-123', distributionNum: 5 } as DistributeJobData,
          {
            supabase: mockSupabase,
            updateProgress: vi.fn(),
            job: {} as Job,
            checkIdempotency: vi.fn(),
            markProcessed: vi.fn(),
          }
        )
      ).rejects.toThrow('Main wallet has no private key');
    });

    it('should handle distribution service failure', async () => {
      const mockCampaign = { id: 'campaign-123', user_id: 'user-456' };
      const mockWallets = [
        {
          id: '1',
          address: 'main-wallet',
          encrypted_private_key: Buffer.from('main-key'),
          is_active: true,
        },
      ];

      mockSupabase.eq.mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({
          data: mockCampaign,
          error: null,
        }),
      });

      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: mockWallets,
          error: null,
        }),
      });

      // Mock distribution failure
      mockDistributeSol.mockResolvedValueOnce({
        success: false,
        wallets: [],
        failed: 5,
      });

      await expect(
        (distributeWorker as any).execute(
          { campaignId: 'campaign-123', distributionNum: 5 } as DistributeJobData,
          {
            supabase: mockSupabase,
            updateProgress: vi.fn(),
            job: {} as Job,
            checkIdempotency: vi.fn(),
            markProcessed: vi.fn(),
          }
        )
      ).rejects.toThrow('Distribution failed');
    });
  });

  describe('Progress Tracking', () => {
    it('should update progress at correct stages', async () => {
      const mockCampaign = { id: 'campaign-123', user_id: 'user-456' };
      const mockWallets = [
        {
          id: '1',
          address: 'main-wallet',
          encrypted_private_key: Buffer.from('main-key'),
          is_active: true,
        },
      ];

      const mockGeneratedWallets = [
        {
          kp: Keypair.generate(),
          buyAmount: 0.1,
          signature: 'sig-1',
        },
      ];

      mockSupabase.eq.mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({
          data: mockCampaign,
          error: null,
        }),
      });

      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: mockWallets,
          error: null,
        }),
      });

      mockDistributeSol.mockResolvedValueOnce({
        success: true,
        wallets: mockGeneratedWallets,
        failed: 0,
      });

      mockSupabase.insert.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-123' },
          error: null,
        }),
      });

      mockSupabase.eq.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'wallet-new-123' },
          error: null,
        }),
      });

      const mockUpdateProgress = vi.fn();

      await (distributeWorker as any).execute(
        { campaignId: 'campaign-123', distributionNum: 1 } as DistributeJobData,
        {
          supabase: mockSupabase,
          updateProgress: mockUpdateProgress,
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(mockUpdateProgress).toHaveBeenCalledWith(10, 'Fetching campaign details');
      expect(mockUpdateProgress).toHaveBeenCalledWith(20, 'Fetching main wallet');
      expect(mockUpdateProgress).toHaveBeenCalledWith(30, 'Decrypting main wallet');
      expect(mockUpdateProgress).toHaveBeenCalledWith(40, expect.stringContaining('Distributing SOL'));
      expect(mockUpdateProgress).toHaveBeenCalledWith(60, expect.stringContaining('Storing generated wallets'));
      expect(mockUpdateProgress).toHaveBeenCalledWith(100, expect.stringContaining('Distribution completed'));
    });
  });

  describe('Queue Integration', () => {
    it('should enqueue buy jobs for each generated wallet', async () => {
      const mockCampaign = { id: 'campaign-123', user_id: 'user-456' };
      const mockWallets = [
        {
          id: '1',
          address: 'main-wallet',
          encrypted_private_key: Buffer.from('main-key'),
          is_active: true,
        },
      ];

      const mockGeneratedWallets = [
        {
          kp: Keypair.generate(),
          buyAmount: 0.1,
          signature: 'sig-1',
        },
        {
          kp: Keypair.generate(),
          buyAmount: 0.15,
          signature: 'sig-2',
        },
      ];

      mockSupabase.eq.mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({
          data: mockCampaign,
          error: null,
        }),
      });

      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: mockWallets,
          error: null,
        }),
      });

      mockDistributeSol.mockResolvedValueOnce({
        success: true,
        wallets: mockGeneratedWallets,
        failed: 0,
      });

      mockSupabase.insert.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'job-123' },
          error: null,
        }),
      });

      mockSupabase.eq.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'wallet-new-123' },
          error: null,
        }),
      });

      await (distributeWorker as any).execute(
        { campaignId: 'campaign-123', distributionNum: 2, runId: 'run-123' } as DistributeJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(mockTradeBuyQueue.add).toHaveBeenCalledTimes(2);
      expect(mockTradeBuyQueue.add).toHaveBeenCalledWith(
        'buy-token',
        expect.objectContaining({
          runId: 'run-123',
          campaignId: 'campaign-123',
          walletId: 'wallet-new-123',
        }),
        expect.objectContaining({ delay: expect.any(Number) })
      );
    });
  });
});
