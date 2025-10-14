import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookWorker, WebhookJobData } from '../WebhookWorker';
import { SupabaseClient } from '@supabase/supabase-js';
import IORedis from 'ioredis';
import { Job } from 'bullmq';
import { createHmac } from 'node:crypto';

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
    getWaitingCount: vi.fn().mockResolvedValue(0),
    getActiveCount: vi.fn().mockResolvedValue(0),
    getDelayedCount: vi.fn().mockResolvedValue(0),
  })),
}));

// Mock global fetch
global.fetch = vi.fn();

// Mock logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

describe('WebhookWorker', () => {
  let webhookWorker: WebhookWorker;
  let mockSupabase: any;
  let mockRedis: IORedis;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock Supabase client with proper query builder chain
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    mockRedis = new IORedis();
    webhookWorker = new WebhookWorker({
      connection: mockRedis,
      supabase: mockSupabase as unknown as SupabaseClient,
    });
  });

  describe('HMAC Signature Generation', () => {
    it('should generate correct HMAC signature', () => {
      const payload = JSON.stringify({ event: 'test', data: 'test-data' });
      const secret = 'test-secret';

      const expectedSignature = createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const signature = (webhookWorker as any).generateSignature(payload, secret);

      expect(signature).toBe(expectedSignature);
    });

    it('should generate different signatures for different payloads', () => {
      const secret = 'test-secret';
      const payload1 = JSON.stringify({ event: 'test1' });
      const payload2 = JSON.stringify({ event: 'test2' });

      const sig1 = (webhookWorker as any).generateSignature(payload1, secret);
      const sig2 = (webhookWorker as any).generateSignature(payload2, secret);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('Webhook Delivery with Logging', () => {
    it('should create delivery record and send webhook successfully', async () => {
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook',
          secret: 'test-secret',
          events: ['test_event'],
          is_active: true,
        },
      ];

      // Mock webhooks query
      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: mockWebhooks,
          error: null,
        }),
      });

      // Mock delivery record insertion
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'delivery-1' },
        error: null,
      });

      // Mock delivery record update (success)
      mockSupabase.update.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      // Mock successful fetch
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('Success'),
      });

      const jobData: WebhookJobData = {
        userId: 'user-123',
        event: 'test_event',
        payload: { test: 'data' },
      };

      const result = await (webhookWorker as any).execute(jobData, {
        supabase: mockSupabase,
        updateProgress: vi.fn(),
        logger: mockLogger,
        job: {} as Job,
        checkIdempotency: vi.fn(),
        markProcessed: vi.fn(),
      });

      expect(result.success).toBe(true);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockSupabase.insert).toHaveBeenCalled();
      expect(mockSupabase.update).toHaveBeenCalled();
    });

    it('should include HMAC signature in request headers', async () => {
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook',
          secret: 'test-secret',
          events: ['test_event'],
          is_active: true,
        },
      ];

      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: mockWebhooks,
          error: null,
        }),
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'delivery-1' },
        error: null,
      });

      mockSupabase.update.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('Success'),
      });

      await (webhookWorker as any).execute(
        { userId: 'user-123', event: 'test_event', payload: { test: 'data' } },
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          logger: mockLogger,
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Webhook-Signature': expect.any(String),
            'X-Webhook-Event': 'test_event',
            'X-Webhook-Timestamp': expect.any(String),
          }),
        })
      );
    });
  });

  describe('Exponential Backoff Retry', () => {
    it('should calculate exponential backoff delays correctly', () => {
      const attempt1 = (webhookWorker as any).calculateRetryDelay(1);
      const attempt2 = (webhookWorker as any).calculateRetryDelay(2);
      const attempt3 = (webhookWorker as any).calculateRetryDelay(3);

      const now = Date.now();

      // 2^1 * 60 = 2 minutes
      expect(attempt1.getTime()).toBeGreaterThan(now + 110000);
      expect(attempt1.getTime()).toBeLessThan(now + 130000);

      // 2^2 * 60 = 4 minutes
      expect(attempt2.getTime()).toBeGreaterThan(now + 230000);
      expect(attempt2.getTime()).toBeLessThan(now + 250000);

      // 2^3 * 60 = 8 minutes
      expect(attempt3.getTime()).toBeGreaterThan(now + 470000);
      expect(attempt3.getTime()).toBeLessThan(now + 490000);
    });

    it('should schedule retry on 5xx errors', async () => {
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook',
          secret: 'test-secret',
          events: ['test_event'],
          is_active: true,
        },
      ];

      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: mockWebhooks,
          error: null,
        }),
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'delivery-1' },
        error: null,
      });

      mockSupabase.update.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      // Mock 500 error
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockResolvedValue('Error'),
      });

      const result = await (webhookWorker as any).execute(
        { userId: 'user-123', event: 'test_event', payload: {} },
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          logger: mockLogger,
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(result.failed).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 500,
        }),
        expect.stringContaining('scheduled for retry')
      );
    });

    it('should not retry on 4xx errors', async () => {
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook',
          secret: 'test-secret',
          events: ['test_event'],
          is_active: true,
        },
      ];

      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: mockWebhooks,
          error: null,
        }),
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'delivery-1' },
        error: null,
      });

      mockSupabase.update.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      // Mock 400 error
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: vi.fn().mockResolvedValue('Error'),
      });

      const result = await (webhookWorker as any).execute(
        { userId: 'user-123', event: 'test_event', payload: {} },
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          logger: mockLogger,
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(result.failed).toBe(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
        }),
        expect.stringContaining('failed permanently')
      );
    });
  });

  describe('Event Filtering', () => {
    it('should only deliver to webhooks subscribed to the event', async () => {
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook1',
          secret: 'secret1',
          events: ['campaign.started'],
          is_active: true,
        },
        {
          id: 'webhook-2',
          url: 'https://example.com/webhook2',
          secret: 'secret2',
          events: ['campaign.completed'],
          is_active: true,
        },
      ];

      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: mockWebhooks,
          error: null,
        }),
      });

      const result = await (webhookWorker as any).execute(
        { userId: 'user-123', event: 'campaign.started', payload: {} },
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          logger: mockLogger,
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        { userId: 'user-123', event: 'campaign.started' },
        'No webhooks subscribed to this event'
      );
      expect(result.sent).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const mockWebhooks = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook',
          secret: 'test-secret',
          events: ['test_event'],
          is_active: true,
        },
      ];

      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: mockWebhooks,
          error: null,
        }),
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'delivery-1' },
        error: null,
      });

      mockSupabase.update.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      // Mock network error
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await (webhookWorker as any).execute(
        { userId: 'user-123', event: 'test_event', payload: {} },
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          logger: mockLogger,
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(result.failed).toBe(1);
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          error_message: 'Network error',
          status: 'retrying',
        })
      );
    });

    it('should handle no webhooks configured', async () => {
      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      });

      const result = await (webhookWorker as any).execute(
        { userId: 'user-123', event: 'test_event', payload: {} },
        {
          supabase: mockSupabase,
          updateProgress: vi.fn(),
          logger: mockLogger,
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(result.success).toBe(true);
      expect(result.sent).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        { userId: 'user-123' },
        'No active webhooks configured for user'
      );
    });
  });

  describe('Progress Tracking', () => {
    it('should update progress at correct stages', async () => {
      mockSupabase.eq.mockReturnValueOnce({
        eq: vi.fn().mockResolvedValueOnce({
          data: [],
          error: null,
        }),
      });

      const mockUpdateProgress = vi.fn();

      await (webhookWorker as any).execute(
        { userId: 'user-123', event: 'test', payload: {} } as WebhookJobData,
        {
          supabase: mockSupabase,
          updateProgress: mockUpdateProgress,
          logger: mockLogger,
          job: {} as Job,
          checkIdempotency: vi.fn(),
          markProcessed: vi.fn(),
        }
      );

      expect(mockUpdateProgress).toHaveBeenCalledWith(10, 'Processing webhook job');
      expect(mockUpdateProgress).toHaveBeenCalledWith(20, 'Fetching user webhooks');
    });
  });
});
