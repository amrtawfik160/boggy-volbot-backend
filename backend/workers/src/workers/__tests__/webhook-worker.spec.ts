import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookWorker, WebhookJobData } from '../WebhookWorker';
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
}));

//Mock global fetch
global.fetch = vi.fn();

describe('WebhookWorker', () => {
  let webhookWorker: WebhookWorker;
  let mockSupabase: any;
  let mockRedis: IORedis;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock chain that properly returns itself
    const mockChain = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };

    mockSupabase = mockChain;

    mockRedis = new IORedis();
    webhookWorker = new WebhookWorker({
      connection: mockRedis,
      supabase: mockSupabase as unknown as SupabaseClient,
    });
  });

  describe('Webhook Sending', () => {
    it('should successfully send webhooks to all active endpoints', async () => {
      const mockWebhooks = [
        {
          id: '1',
          url: 'https://example.com/webhook1',
          secret: 'secret1',
          events: ['campaign.started', 'campaign.stopped'],
          is_active: true,
        },
        {
          id: '2',
          url: 'https://example.com/webhook2',
          secret: 'secret2',
          events: ['campaign.started'],
          is_active: true,
        },
      ];

      mockSupabase.eq.mockResolvedValueOnce({
        data: mockWebhooks,
        error: null,
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const jobData: WebhookJobData = {
        userId: 'user-123',
        event: 'campaign.started',
        payload: { campaignId: 'campaign-456' },
      };

      const result = await (webhookWorker as any).execute(jobData, {
        supabase: mockSupabase,
        updateProgress: vi.fn(),
        job: {} as Job,
        checkIdempotency: vi.fn(),
        markProcessed: vi.fn(),
      });

      expect(result.success).toBe(true);
      expect(result.sent).toBe(2);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should filter webhooks by event type', async () => {
      const mockWebhooks = [
        {
          id: '1',
          url: 'https://example.com/webhook1',
          secret: 'secret1',
          events: ['campaign.stopped'],
          is_active: true,
        },
        {
          id: '2',
          url: 'https://example.com/webhook2',
          secret: 'secret2',
          events: ['campaign.started'],
          is_active: true,
        },
      ];

      mockSupabase.eq.mockResolvedValueOnce({
        data: mockWebhooks,
        error: null,
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const jobData: WebhookJobData = {
        userId: 'user-123',
        event: 'campaign.started',
        payload: {},
      };

      const result = await (webhookWorker as any).execute(jobData, {
        supabase: mockSupabase,
        updateProgress: vi.fn(),
        job: {} as Job,
        checkIdempotency: vi.fn(),
        markProcessed: vi.fn(),
      });

      expect(result.success).toBe(true);
      expect(result.sent).toBe(1); // Only one webhook should match
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle no active webhooks gracefully', async () => {
      mockSupabase.eq.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await (webhookWorker as any).execute(
        { userId: 'user-123', event: 'test', payload: {} } as WebhookJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(result.success).toBe(true);
      expect(result.sent).toBe(0);
    });

    it('should handle webhook delivery failures', async () => {
      const mockWebhooks = [
        {
          id: '1',
          url: 'https://example.com/webhook1',
          secret: 'secret1',
          events: ['test'],
          is_active: true,
        },
        {
          id: '2',
          url: 'https://example.com/webhook2',
          secret: 'secret2',
          events: ['test'],
          is_active: true,
        },
      ];

      mockSupabase.eq.mockResolvedValueOnce({
        data: mockWebhooks,
        error: null,
      });

      // First fails, second succeeds
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await (webhookWorker as any).execute(
        { userId: 'user-123', event: 'test', payload: {} } as WebhookJobData,
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(result.success).toBe(true);
      expect(result.sent).toBe(1); // Only one succeeded
    });
  });

  describe('Progress Tracking', () => {
    it('should update progress at correct stages', async () => {
      mockSupabase.eq.mockResolvedValueOnce({
        data: [{ url: 'https://example.com', secret: 'secret', events: ['test'], is_active: true }],
        error: null,
      });

      (global.fetch as any).mockResolvedValue({ ok: true, status: 200 });

      const mockUpdateProgress = vi.fn();

      await (webhookWorker as any).execute(
        { userId: 'user-123', event: 'test', payload: {} } as WebhookJobData,
        {
          supabase: mockSupabase,
          updateProgress: mockUpdateProgress,
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(mockUpdateProgress).toHaveBeenCalledWith(20, 'Fetching user webhooks');
      expect(mockUpdateProgress).toHaveBeenCalledWith(40, expect.stringContaining('Sending'));
      expect(mockUpdateProgress).toHaveBeenCalledWith(100, expect.stringContaining('Webhooks sent'));
    });
  });
});
