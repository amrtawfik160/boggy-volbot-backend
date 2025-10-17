import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FundsGatherWorker, FundsGatherJobData } from '../FundsGatherWorker';
import { SupabaseClient } from '@supabase/supabase-js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import IORedis from 'ioredis';
import { Job } from 'bullmq';
import bs58 from 'bs58';

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

vi.mock('../utils/crypto', () => ({
  getKeypairFromEncrypted: vi.fn(),
  decryptPrivateKey: vi.fn((buf: Buffer) => {
    // Return a valid base58 private key for testing
    const mockKp = Keypair.generate();
    return bs58.encode(mockKp.secretKey);
  }),
  encryptPrivateKey: vi.fn(),
}));

vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual<typeof import('@solana/web3.js')>('@solana/web3.js');
  return {
    ...actual,
    sendAndConfirmTransaction: vi.fn().mockResolvedValue('mock-signature'),
  };
});

describe('FundsGatherWorker', () => {
  let fundsGatherWorker: FundsGatherWorker;
  let mockSupabase: any;
  let mockConnection: Connection;
  let mockRedis: IORedis;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a proper mock Supabase client with query builder chain
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    mockRedis = new IORedis();
    mockConnection = {
      getBalance: vi.fn().mockResolvedValue(1_000_000), // 0.001 SOL
      getMinimumBalanceForRentExemption: vi.fn().mockResolvedValue(5_000),
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: 'mock-blockhash' }),
    } as any;

    fundsGatherWorker = new FundsGatherWorker(
      {
        connection: mockRedis,
        supabase: mockSupabase as unknown as SupabaseClient,
      },
      mockConnection
    );
  });

  describe('Funds Gathering', () => {
    it('should successfully gather funds from multiple wallets', async () => {
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
        {
          id: '2',
          address: 'wallet-2',
          encrypted_private_key: Buffer.from('key-2'),
          is_active: true,
        },
      ];

      // First query: .from().select().eq().single() for campaign
      mockSupabase.eq.mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({
          data: mockCampaign,
          error: null,
        })
      });

      // Second query: .from().select().eq().eq() for wallets
      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: mockWallets,
          error: null,
        })
      });

      const result = await (fundsGatherWorker as any).execute(
        { campaignId: 'campaign-123' } as FundsGatherJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(result.success).toBe(true);
      expect(result.gatheredWallets).toBeGreaterThan(0);
      expect(result.totalGathered).toBeGreaterThan(0);
    });

    it('should handle campaign not found error', async () => {
      mockSupabase.eq.mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({
          data: null,
          error: { message: 'Campaign not found' },
        })
      });

      await expect(
        (fundsGatherWorker as any).execute(
          { campaignId: 'invalid' } as FundsGatherJobData,
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
      // First query: .from().select().eq().single() for campaign
      mockSupabase.eq.mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({
          data: { id: 'campaign-123', user_id: 'user-456' },
          error: null,
        })
      });

      // Second query: .from().select().eq().eq() for wallets
      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        })
      });

      await expect(
        (fundsGatherWorker as any).execute(
          { campaignId: 'campaign-123' } as FundsGatherJobData,
          {
            supabase: mockSupabase,
            updateProgress: vi.fn(),
            job: {} as Job,
            checkIdempotency: vi.fn(),
            markProcessed: vi.fn(),
          }
        )
      ).rejects.toThrow('No active wallets found');
    });

    it('should skip wallets with insufficient balance', async () => {
      const mockCampaign = { id: 'campaign-123', user_id: 'user-456' };
      const mockWallets = [
        {
          id: '1',
          address: 'main-wallet',
          encrypted_private_key: Buffer.from('main-key'),
          is_active: true,
        },
        {
          id: '2',
          address: 'empty-wallet',
          encrypted_private_key: Buffer.from('key-2'),
          is_active: true,
        },
      ];

      // First query: .from().select().eq().single() for campaign
      mockSupabase.eq.mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({ data: mockCampaign, error: null })
      });

      // Second query: .from().select().eq().eq() for wallets
      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ data: mockWallets, error: null })
      });

      // Mock balance check to return 0 for second wallet
      (mockConnection.getBalance as any).mockResolvedValue(0);

      const result = await (fundsGatherWorker as any).execute(
        { campaignId: 'campaign-123' } as FundsGatherJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(result.success).toBe(true);
      expect(result.gatheredWallets).toBe(0); // No wallets had sufficient balance
    });
  });

  describe('Progress Tracking', () => {
    it('should update progress at correct stages', async () => {
      const mockCampaign = { id: 'campaign-123', user_id: 'user-456' };
      const mockWallets = [{ id: '1', address: 'wallet-1', encrypted_private_key: Buffer.from('key-1'), is_active: true }];

      // First query: .from().select().eq().single() for campaign
      mockSupabase.eq.mockReturnValueOnce({
        single: vi.fn().mockResolvedValueOnce({ data: mockCampaign, error: null })
      });

      // Second query: .from().select().eq().eq() for wallets
      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ data: mockWallets, error: null })
      });

      const mockUpdateProgress = vi.fn();

      await (fundsGatherWorker as any).execute(
        { campaignId: 'campaign-123' } as FundsGatherJobData,
        {
          supabase: mockSupabase,
          updateProgress: mockUpdateProgress,
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(mockUpdateProgress).toHaveBeenCalledWith(10, 'Fetching campaign details');
      expect(mockUpdateProgress).toHaveBeenCalledWith(20, 'Fetching active wallets');
      expect(mockUpdateProgress).toHaveBeenCalledWith(30, 'Identifying main wallet');
      expect(mockUpdateProgress).toHaveBeenCalledWith(100, expect.stringContaining('Funds gathering completed'));
    });
  });
});
