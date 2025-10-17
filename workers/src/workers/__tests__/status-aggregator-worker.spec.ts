import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusAggregatorWorker } from '../StatusAggregatorWorker';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Mock dependencies
vi.mock('ioredis');
vi.mock('bullmq');

describe('StatusAggregatorWorker', () => {
  let aggregatorWorker: StatusAggregatorWorker;
  let mockSupabase: any;
  let mockRedis: IORedis;
  let mockStatusQueue: any;

  beforeEach(() => {
    vi.useFakeTimers();

    // Mock Supabase client
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    // Mock Redis connection
    mockRedis = new IORedis();

    // Mock Status Queue
    mockStatusQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-123' }),
      close: vi.fn(),
    };

    // Initialize StatusAggregatorWorker
    aggregatorWorker = new StatusAggregatorWorker({
      connection: mockRedis,
      supabase: mockSupabase,
      statusQueue: mockStatusQueue as unknown as Queue,
      intervalSeconds: 10, // 10 seconds for testing
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    aggregatorWorker.stop();
  });

  describe('Scheduler Initialization', () => {
    it('should start periodic scheduling when start() is called', () => {
      aggregatorWorker.start();

      // Verify that checkAndScheduleActiveCampaigns is called immediately
      expect(mockSupabase.from).toHaveBeenCalled();
    });

    it('should stop periodic scheduling when stop() is called', () => {
      aggregatorWorker.start();
      const spy = vi.spyOn(aggregatorWorker as any, 'checkAndScheduleActiveCampaigns');

      aggregatorWorker.stop();

      // Advance timers to see if scheduler still runs
      vi.advanceTimersByTime(15000);

      // Should not be called after stop
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Active Campaign Detection', () => {
    it('should query for campaigns with status="active" and runs with status="running"', async () => {
      mockSupabase.in.mockReturnValueOnce({
        in: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        }),
      });

      await (aggregatorWorker as any).checkAndScheduleActiveCampaigns();

      expect(mockSupabase.from).toHaveBeenCalledWith('campaign_runs');
      expect(mockSupabase.in).toHaveBeenCalledWith('status', ['running']);
    });

    it('should schedule status jobs for each active campaign', async () => {
      const mockActiveCampaigns = [
        { id: 'run-1', campaign_id: 'campaign-1', campaigns: { id: 'campaign-1', status: 'active' } },
        { id: 'run-2', campaign_id: 'campaign-2', campaigns: { id: 'campaign-2', status: 'active' } },
      ];

      mockSupabase.in.mockReturnValueOnce({
        in: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: mockActiveCampaigns,
            error: null,
          }),
        }),
      });

      // Mock DB job creation
      mockSupabase.insert.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: 'db-job-1' },
            error: null,
          }),
        }),
      });

      mockSupabase.insert.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: 'db-job-2' },
            error: null,
          }),
        }),
      });

      await (aggregatorWorker as any).checkAndScheduleActiveCampaigns();

      expect(mockStatusQueue.add).toHaveBeenCalledTimes(2);
      expect(mockStatusQueue.add).toHaveBeenCalledWith(
        'aggregate-status',
        expect.objectContaining({
          campaignId: 'campaign-1',
          runId: 'run-1',
          dbJobId: 'db-job-1',
        }),
        expect.any(Object)
      );
    });

    it('should not schedule jobs when no active campaigns exist', async () => {
      mockSupabase.in.mockReturnValueOnce({
        in: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: [],
            error: null,
          }),
        }),
      });

      await (aggregatorWorker as any).checkAndScheduleActiveCampaigns();

      expect(mockStatusQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('Duplicate Prevention', () => {
    it('should not schedule the same campaign twice within the interval', async () => {
      const mockActiveCampaigns = [
        { id: 'run-1', campaign_id: 'campaign-1', campaigns: { id: 'campaign-1', status: 'active' } },
      ];

      // First call
      mockSupabase.in.mockReturnValueOnce({
        in: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: mockActiveCampaigns,
            error: null,
          }),
        }),
      });

      mockSupabase.insert.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: 'db-job-1' },
            error: null,
          }),
        }),
      });

      await (aggregatorWorker as any).checkAndScheduleActiveCampaigns();
      expect(mockStatusQueue.add).toHaveBeenCalledTimes(1);

      // Second call immediately after (within 80% of interval)
      mockSupabase.in.mockReturnValueOnce({
        in: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: mockActiveCampaigns,
            error: null,
          }),
        }),
      });

      await (aggregatorWorker as any).checkAndScheduleActiveCampaigns();

      // Should still be 1 (not scheduled again)
      expect(mockStatusQueue.add).toHaveBeenCalledTimes(1);
    });

    it('should schedule again after sufficient time has passed', async () => {
      const mockActiveCampaigns = [
        { id: 'run-1', campaign_id: 'campaign-1', campaigns: { id: 'campaign-1', status: 'active' } },
      ];

      // First call
      mockSupabase.in.mockReturnValueOnce({
        in: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: mockActiveCampaigns,
            error: null,
          }),
        }),
      });

      mockSupabase.insert.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: 'db-job-1' },
            error: null,
          }),
        }),
      });

      await (aggregatorWorker as any).checkAndScheduleActiveCampaigns();
      expect(mockStatusQueue.add).toHaveBeenCalledTimes(1);

      // Advance time by 10 seconds (full interval)
      vi.advanceTimersByTime(10000);

      // Second call after sufficient time
      mockSupabase.in.mockReturnValueOnce({
        in: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: mockActiveCampaigns,
            error: null,
          }),
        }),
      });

      mockSupabase.insert.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: 'db-job-2' },
            error: null,
          }),
        }),
      });

      await (aggregatorWorker as any).checkAndScheduleActiveCampaigns();

      // Should be scheduled again
      expect(mockStatusQueue.add).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle database query errors gracefully', async () => {
      mockSupabase.in.mockReturnValueOnce({
        in: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      });

      // Should not throw
      await expect(
        (aggregatorWorker as any).checkAndScheduleActiveCampaigns()
      ).resolves.not.toThrow();

      expect(mockStatusQueue.add).not.toHaveBeenCalled();
    });

    it('should handle job creation errors gracefully', async () => {
      const mockActiveCampaigns = [
        { id: 'run-1', campaign_id: 'campaign-1', campaigns: { id: 'campaign-1', status: 'active' } },
      ];

      mockSupabase.in.mockReturnValueOnce({
        in: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: mockActiveCampaigns,
            error: null,
          }),
        }),
      });

      // Mock DB job creation failure
      mockSupabase.insert.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: null,
            error: { message: 'Insert failed' },
          }),
        }),
      });

      // Should not throw and should not add to queue
      await expect(
        (aggregatorWorker as any).checkAndScheduleActiveCampaigns()
      ).resolves.not.toThrow();

      expect(mockStatusQueue.add).not.toHaveBeenCalled();
    });

    it('should handle queue add errors gracefully', async () => {
      const mockActiveCampaigns = [
        { id: 'run-1', campaign_id: 'campaign-1', campaigns: { id: 'campaign-1', status: 'active' } },
      ];

      mockSupabase.in.mockReturnValueOnce({
        in: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: mockActiveCampaigns,
            error: null,
          }),
        }),
      });

      mockSupabase.insert.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: 'db-job-1' },
            error: null,
          }),
        }),
      });

      mockStatusQueue.add.mockRejectedValueOnce(new Error('Queue error'));

      // Should not throw
      await expect(
        (aggregatorWorker as any).checkAndScheduleActiveCampaigns()
      ).resolves.not.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should clean up stale campaign entries when campaigns become inactive', async () => {
      // First: schedule campaign-1
      const initialCampaigns = [
        { id: 'run-1', campaign_id: 'campaign-1', campaigns: { id: 'campaign-1', status: 'active' } },
      ];

      mockSupabase.in.mockReturnValueOnce({
        in: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: initialCampaigns,
            error: null,
          }),
        }),
      });

      mockSupabase.insert.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: 'db-job-1' },
            error: null,
          }),
        }),
      });

      await (aggregatorWorker as any).checkAndScheduleActiveCampaigns();

      // Check internal map has campaign-1
      expect((aggregatorWorker as any).scheduledCampaigns.has('campaign-1')).toBe(true);

      // Advance time
      vi.advanceTimersByTime(10000);

      // Second: campaign-1 is no longer active
      const updatedCampaigns = [
        { id: 'run-2', campaign_id: 'campaign-2', campaigns: { id: 'campaign-2', status: 'active' } },
      ];

      mockSupabase.in.mockReturnValueOnce({
        in: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockResolvedValueOnce({
            data: updatedCampaigns,
            error: null,
          }),
        }),
      });

      mockSupabase.insert.mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          single: vi.fn().mockResolvedValueOnce({
            data: { id: 'db-job-2' },
            error: null,
          }),
        }),
      });

      await (aggregatorWorker as any).checkAndScheduleActiveCampaigns();

      // campaign-1 should be cleaned up from internal map
      expect((aggregatorWorker as any).scheduledCampaigns.has('campaign-1')).toBe(false);
      expect((aggregatorWorker as any).scheduledCampaigns.has('campaign-2')).toBe(true);
    });
  });
});
