import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GatherWorker, GatherJobData, GatherJobResult } from '../GatherWorker';
import { SupabaseClient } from '@supabase/supabase-js';
import IORedis from 'ioredis';
import { Job } from 'bullmq';

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
  Job: vi.fn(),
}));

describe('GatherWorker', () => {
  let gatherWorker: GatherWorker;
  let mockSupabase: any;
  let mockRedis: IORedis;

  beforeEach(() => {
    // Create mock Supabase client
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      update: vi.fn().mockReturnThis(),
    };

    // Create mock Redis connection
    mockRedis = new IORedis();

    // Initialize GatherWorker
    gatherWorker = new GatherWorker({
      connection: mockRedis,
      supabase: mockSupabase as unknown as SupabaseClient,
    });
  });

  describe('Pool Information Gathering', () => {
    it('should successfully gather pool information', async () => {
      const mockPool = {
        id: 'pool-123',
        pool_address: 'pool-addr-123',
        metadata: {
          liquidity: 50000,
        },
        tokens: {
          mint: 'token-mint-123',
        },
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockPool,
        error: null,
      });

      const jobData: GatherJobData = {
        runId: 'run-123',
        campaignId: 'campaign-456',
        poolId: 'pool-123',
      };

      const mockUpdateProgress = vi.fn();

      const result = await (gatherWorker as any).execute(jobData, {
        supabase: mockSupabase,
        updateProgress: mockUpdateProgress,
        job: {} as Job,
        checkIdempotency: vi.fn(),
        markProcessed: vi.fn(),
      });

      expect(result.success).toBe(true);
      expect(result.poolInfo).toBeDefined();
      expect(result.poolInfo?.poolId).toBe('pool-addr-123');
      expect(result.poolInfo?.baseMint).toBe('token-mint-123');
      expect(result.poolInfo?.quoteMint).toBe('So11111111111111111111111111111111111111112');
      expect(result.poolInfo?.liquidity).toBe(50000);

      // Verify progress updates
      expect(mockUpdateProgress).toHaveBeenCalledWith(10, 'Fetching pool information');
      expect(mockUpdateProgress).toHaveBeenCalledWith(50, 'Processing pool data');
      expect(mockUpdateProgress).toHaveBeenCalledWith(100, 'Pool information gathered successfully');
    });

    it('should handle pool not found error', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Pool not found' },
      });

      const jobData: GatherJobData = {
        runId: 'run-123',
        campaignId: 'campaign-456',
        poolId: 'invalid-pool',
      };

      await expect(
        (gatherWorker as any).execute(jobData, {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        })
      ).rejects.toThrow('Pool not found');
    });

    it('should handle missing pool data', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const jobData: GatherJobData = {
        poolId: 'pool-123',
      };

      await expect(
        (gatherWorker as any).execute(jobData, {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        })
      ).rejects.toThrow('Pool not found');
    });

    it('should handle pool with missing metadata', async () => {
      const mockPool = {
        id: 'pool-123',
        pool_address: 'pool-addr-123',
        metadata: null, // No metadata
        tokens: {
          mint: 'token-mint-123',
        },
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockPool,
        error: null,
      });

      const result = await (gatherWorker as any).execute(
        { poolId: 'pool-123' } as GatherJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(result.success).toBe(true);
      expect(result.poolInfo?.liquidity).toBe(0); // Default value
    });

    it('should handle pool with missing tokens', async () => {
      const mockPool = {
        id: 'pool-123',
        pool_address: 'pool-addr-123',
        metadata: { liquidity: 1000 },
        tokens: null, // No tokens
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockPool,
        error: null,
      });

      await expect(
        (gatherWorker as any).execute(
          { poolId: 'pool-123' } as GatherJobData,
          {
            supabase: mockSupabase,
            updateProgress: vi.fn(),
            job: {} as Job,
            checkIdempotency: vi.fn(),
            markProcessed: vi.fn(),
          }
        )
      ).rejects.toThrow(); // Should fail due to accessing tokens.mint
    });
  });

  describe('Queue Integration', () => {
    it('should query pool data with correct parameters', async () => {
      const mockPool = {
        pool_address: 'addr-123',
        metadata: { liquidity: 5000 },
        tokens: { mint: 'mint-123' },
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockPool,
        error: null,
      });

      await (gatherWorker as any).execute(
        { poolId: 'test-pool-id' } as GatherJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(mockSupabase.from).toHaveBeenCalledWith('pools');
      expect(mockSupabase.select).toHaveBeenCalledWith('*, tokens(*)');
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'test-pool-id');
      expect(mockSupabase.single).toHaveBeenCalled();
    });
  });

  describe('Progress Tracking', () => {
    it('should update progress at correct stages', async () => {
      const mockPool = {
        pool_address: 'addr-123',
        metadata: { liquidity: 1000 },
        tokens: { mint: 'mint-123' },
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockPool,
        error: null,
      });

      const mockUpdateProgress = vi.fn();

      await (gatherWorker as any).execute(
        { poolId: 'pool-123' } as GatherJobData,
        {
          supabase: mockSupabase,
          updateProgress: mockUpdateProgress,
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(mockUpdateProgress).toHaveBeenCalledTimes(3);
      expect(mockUpdateProgress).toHaveBeenNthCalledWith(1, 10, 'Fetching pool information');
      expect(mockUpdateProgress).toHaveBeenNthCalledWith(2, 50, 'Processing pool data');
      expect(mockUpdateProgress).toHaveBeenNthCalledWith(3, 100, 'Pool information gathered successfully');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when poolId is undefined', async () => {
      const jobData: GatherJobData = {};

      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(
        (gatherWorker as any).execute(jobData, {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        })
      ).rejects.toThrow();
    });

    it('should handle database query errors', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed', code: 'CONN_ERROR' },
      });

      await expect(
        (gatherWorker as any).execute(
          { poolId: 'pool-123' } as GatherJobData,
          {
            supabase: mockSupabase,
            updateProgress: vi.fn(),
            job: {} as Job,
            checkIdempotency: vi.fn(),
            markProcessed: vi.fn(),
          }
        )
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('Worker Lifecycle', () => {
    it('should close worker gracefully', async () => {
      const closeSpy = vi.spyOn(gatherWorker as any, 'close');
      await gatherWorker.close();
      expect(closeSpy).toHaveBeenCalled();
    });

    it('should return the underlying worker instance', () => {
      const worker = gatherWorker.getWorker();
      expect(worker).toBeDefined();
    });

    it('should have dead-letter queue enabled', () => {
      const dlq = gatherWorker.getDeadLetterQueue();
      expect(dlq).toBeDefined();
    });
  });
});
