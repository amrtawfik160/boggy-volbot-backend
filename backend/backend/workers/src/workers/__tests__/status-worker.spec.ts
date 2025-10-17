import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { StatusWorker, StatusJobData, StatusJobResult } from '../StatusWorker';
import { SupabaseClient } from '@supabase/supabase-js';
import IORedis from 'ioredis';

// Mock dependencies
vi.mock('ioredis');
vi.mock('@supabase/supabase-js');

describe('StatusWorker', () => {
  let statusWorker: StatusWorker;
  let mockSupabase: any;
  let mockRedis: IORedis;
  let mockWebSocketBroadcast: Mock;

  beforeEach(() => {
    // Create mock Supabase client
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
      update: vi.fn().mockReturnThis(),
    };

    // Create mock Redis connection
    mockRedis = new IORedis();

    // Create mock WebSocket broadcast function
    mockWebSocketBroadcast = vi.fn();

    // Initialize StatusWorker
    statusWorker = new StatusWorker({
      connection: mockRedis,
      supabase: mockSupabase as unknown as SupabaseClient,
      websocketBroadcast: mockWebSocketBroadcast,
    });
  });

  describe('Metrics Calculation', () => {
    it('should calculate comprehensive metrics for a campaign run', async () => {
      const mockRunData = {
        id: 'run-123',
        campaign_id: 'campaign-456',
        status: 'running',
        jobs: [
          { id: '1', status: 'succeeded', queue: 'trade.buy', executions: [{ latency_ms: 100 }] },
          { id: '2', status: 'succeeded', queue: 'trade.sell', executions: [{ latency_ms: 150 }] },
          { id: '3', status: 'failed', queue: 'trade.buy', executions: [] },
          { id: '4', status: 'queued', queue: 'gather', executions: [] },
          { id: '5', status: 'running', queue: 'trade.buy', executions: [] },
        ],
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockRunData,
        error: null,
      });

      mockSupabase.update.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ error: null }),
      });

      const result = await (statusWorker as any).execute(
        { runId: 'run-123', campaignId: 'campaign-456' } as StatusJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
        }
      );

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.totalJobs).toBe(5);
      expect(result.metrics?.succeededJobs).toBe(2);
      expect(result.metrics?.failedJobs).toBe(1);
      expect(result.metrics?.queuedJobs).toBe(1);
      expect(result.metrics?.runningJobs).toBe(1);
      expect(result.metrics?.successRate).toBe(0.4); // 2/5
      expect(result.metrics?.avgLatencyMs).toBe(125); // (100 + 150) / 2
    });

    it('should calculate queue-specific breakdown correctly', async () => {
      const mockRunData = {
        id: 'run-123',
        campaign_id: 'campaign-456',
        status: 'running',
        jobs: [
          { id: '1', status: 'succeeded', queue: 'trade.buy', executions: [] },
          { id: '2', status: 'succeeded', queue: 'trade.buy', executions: [] },
          { id: '3', status: 'failed', queue: 'trade.buy', executions: [] },
          { id: '4', status: 'succeeded', queue: 'trade.sell', executions: [] },
          { id: '5', status: 'queued', queue: 'gather', executions: [] },
        ],
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockRunData,
        error: null,
      });

      mockSupabase.update.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ error: null }),
      });

      const result = await (statusWorker as any).execute(
        { runId: 'run-123' } as StatusJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
        }
      );

      expect(result.metrics?.byQueue['trade.buy']).toEqual({
        total: 3,
        succeeded: 2,
        failed: 1,
        queued: 0,
        running: 0,
      });

      expect(result.metrics?.byQueue['trade.sell']).toEqual({
        total: 1,
        succeeded: 1,
        failed: 0,
        queued: 0,
        running: 0,
      });

      expect(result.metrics?.byQueue['gather']).toEqual({
        total: 1,
        succeeded: 0,
        failed: 0,
        queued: 1,
        running: 0,
      });
    });

    it('should handle empty job list', async () => {
      const mockRunData = {
        id: 'run-123',
        campaign_id: 'campaign-456',
        status: 'running',
        jobs: [],
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockRunData,
        error: null,
      });

      mockSupabase.update.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ error: null }),
      });

      const result = await (statusWorker as any).execute(
        { runId: 'run-123' } as StatusJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
        }
      );

      expect(result.success).toBe(true);
      expect(result.metrics?.totalJobs).toBe(0);
      expect(result.metrics?.successRate).toBe(0);
      expect(result.metrics?.avgLatencyMs).toBe(0);
      expect(result.metrics?.byQueue).toEqual({});
    });
  });

  describe('Database Updates', () => {
    it('should update campaign_runs.summary with calculated metrics', async () => {
      const mockRunData = {
        id: 'run-123',
        campaign_id: 'campaign-456',
        status: 'running',
        jobs: [
          { id: '1', status: 'succeeded', queue: 'trade.buy', executions: [] },
          { id: '2', status: 'failed', queue: 'trade.sell', executions: [] },
        ],
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockRunData,
        error: null,
      });

      const mockUpdateEq = vi.fn().mockResolvedValueOnce({ error: null });
      mockSupabase.update.mockReturnValueOnce({
        eq: mockUpdateEq,
      });

      await (statusWorker as any).execute(
        { runId: 'run-123' } as StatusJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
        }
      );

      expect(mockSupabase.update).toHaveBeenCalled();
      expect(mockUpdateEq).toHaveBeenCalledWith('id', 'run-123');
    });

    it('should handle database update errors gracefully', async () => {
      const mockRunData = {
        id: 'run-123',
        campaign_id: 'campaign-456',
        status: 'running',
        jobs: [],
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockRunData,
        error: null,
      });

      mockSupabase.update.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ error: { message: 'DB error' } }),
      });

      // Should not throw, but log error
      const result = await (statusWorker as any).execute(
        { runId: 'run-123' } as StatusJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
        }
      );

      expect(result.success).toBe(true); // Still returns success
    });
  });

  describe('WebSocket Broadcasting', () => {
    it('should broadcast status update via WebSocket when configured', async () => {
      const mockRunData = {
        id: 'run-123',
        campaign_id: 'campaign-456',
        status: 'running',
        jobs: [],
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockRunData,
        error: null,
      });

      mockSupabase.update.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ error: null }),
      });

      await (statusWorker as any).execute(
        { runId: 'run-123' } as StatusJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
        }
      );

      expect(mockWebSocketBroadcast).toHaveBeenCalledWith(
        'campaign-456',
        'campaign:status',
        expect.objectContaining({
          runId: 'run-123',
          campaignId: 'campaign-456',
          status: 'running',
          metrics: expect.any(Object),
          updatedAt: expect.any(String),
        })
      );
    });

    it('should handle WebSocket broadcast errors gracefully', async () => {
      mockWebSocketBroadcast.mockImplementation(() => {
        throw new Error('WebSocket error');
      });

      const mockRunData = {
        id: 'run-123',
        campaign_id: 'campaign-456',
        status: 'running',
        jobs: [],
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: mockRunData,
        error: null,
      });

      mockSupabase.update.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ error: null }),
      });

      // Should not throw
      const result = await (statusWorker as any).execute(
        { runId: 'run-123' } as StatusJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
        }
      );

      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return failure when runId and campaignId are both missing', async () => {
      const result = await (statusWorker as any).execute(
        {} as StatusJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
        }
      );

      expect(result.success).toBe(false);
    });

    it('should handle database fetch errors', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      const result = await (statusWorker as any).execute(
        { runId: 'run-123' } as StatusJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
        }
      );

      expect(result.success).toBe(false);
    });

    it('should fallback to campaignId when runId is not provided', async () => {
      const mockRunData = {
        id: 'run-999',
        campaign_id: 'campaign-456',
        status: 'running',
        jobs: [],
      };

      // Mock the order().limit() chain for campaignId fallback
      mockSupabase.order.mockReturnValueOnce({
        limit: vi.fn().mockResolvedValueOnce({
          data: [mockRunData],
          error: null,
        }),
      });

      mockSupabase.update.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({ error: null }),
      });

      const result = await (statusWorker as any).execute(
        { campaignId: 'campaign-456' } as StatusJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
        }
      );

      expect(result.success).toBe(true);
      expect(result.runId).toBe('run-999');
    });
  });
});
