import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { StatusMonitorService } from './status-monitor.service';
import { CampaignWebSocketGateway } from '../websocket/websocket.gateway';
import { SupabaseClient } from '@supabase/supabase-js';

// Mock the supabase config
vi.mock('../config/supabase', () => ({
  supabaseAdmin: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
    from: vi.fn(),
  },
}));

describe('StatusMonitorService', () => {
  let service: StatusMonitorService;
  let mockGateway: Partial<CampaignWebSocketGateway>;
  let mockSupabase: any;
  let mockChannel: any;
  let mockSubscription: any;
  let subscribeCallback: any;
  let changeCallback: any;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock gateway
    mockGateway = {
      emitToCampaign: vi.fn(),
    };

    // Create mock subscription and channel
    mockSubscription = {
      unsubscribe: vi.fn(),
    };

    mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((callback) => {
        subscribeCallback = callback;
        callback('SUBSCRIBED');
        return mockSubscription;
      }),
    };

    // Mock Supabase methods
    mockSupabase = {
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn().mockResolvedValue(undefined),
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };

    // Inject mock supabase
    const { supabaseAdmin } = await import('../config/supabase');
    Object.assign(supabaseAdmin, mockSupabase);

    // Capture the change callback before module creation
    mockChannel.on.mockImplementation((event: string, config: any, callback: any) => {
      changeCallback = callback;
      return mockChannel;
    });

    // Create testing module
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusMonitorService,
        {
          provide: CampaignWebSocketGateway,
          useValue: mockGateway,
        },
      ],
    }).compile();

    service = module.get<StatusMonitorService>(StatusMonitorService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Module Lifecycle', () => {
    it('should initialize monitoring on module init', async () => {
      await service.onModuleInit();

      expect(mockSupabase.channel).toHaveBeenCalledWith('campaign_runs_updates');
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: 'UPDATE',
          schema: 'public',
          table: 'campaign_runs',
          filter: 'summary=not.is.null',
        }),
        expect.any(Function)
      );
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('should cleanup subscription on module destroy', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockSupabase.removeChannel).toHaveBeenCalled();
    });

    it('should handle subscription success status', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await service.onModuleInit();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[StatusMonitor] Successfully subscribed to campaign_runs updates'
      );

      consoleSpy.mockRestore();
    });

    it('should handle CHANNEL_ERROR status and reconnect', async () => {
      vi.useFakeTimers();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockChannel.subscribe.mockImplementation((callback) => {
        subscribeCallback = callback;
        callback('CHANNEL_ERROR');
        return mockSubscription;
      });

      await service.onModuleInit();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[StatusMonitor] Channel error, attempting to reconnect...'
      );

      // Fast-forward time to trigger reconnect
      vi.advanceTimersByTime(5000);

      // Should attempt to reconnect
      expect(mockSupabase.channel).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should handle TIMED_OUT status and reconnect', async () => {
      vi.useFakeTimers();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockChannel.subscribe.mockImplementation((callback) => {
        subscribeCallback = callback;
        callback('TIMED_OUT');
        return mockSubscription;
      });

      await service.onModuleInit();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[StatusMonitor] Subscription timed out, attempting to reconnect...'
      );

      // Fast-forward time to trigger reconnect
      vi.advanceTimersByTime(5000);

      // Should attempt to reconnect
      expect(mockSupabase.channel).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe('Campaign Run Update Handling', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should broadcast campaign status on update', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const payload = {
        new: {
          id: 'run-123',
          campaign_id: 'campaign-456',
          status: 'running',
          summary: {
            totalTrades: 10,
            successfulTrades: 8,
            failedTrades: 2,
          },
        },
      };

      changeCallback(payload);

      // Verify the log was called (indicates the method ran)
      expect(consoleSpy).toHaveBeenCalledWith(
        '[StatusMonitor] Broadcasting status update for campaign campaign-456 (run: run-123)'
      );

      consoleSpy.mockRestore();
    });

    it('should ignore updates without campaign_id', () => {
      const payload = {
        new: {
          id: 'run-123',
          status: 'running',
          summary: { totalTrades: 10 },
        },
      };

      changeCallback(payload);

      expect(mockGateway.emitToCampaign).not.toHaveBeenCalled();
    });

    it('should ignore updates without summary', () => {
      const payload = {
        new: {
          id: 'run-123',
          campaign_id: 'campaign-456',
          status: 'running',
        },
      };

      changeCallback(payload);

      expect(mockGateway.emitToCampaign).not.toHaveBeenCalled();
    });

    it('should ignore updates with null payload', () => {
      const payload = {
        new: null,
      };

      changeCallback(payload);

      expect(mockGateway.emitToCampaign).not.toHaveBeenCalled();
    });

    it('should handle errors during update broadcast gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (mockGateway.emitToCampaign as any).mockImplementation(() => {
        throw new Error('Broadcast error');
      });

      const payload = {
        new: {
          id: 'run-123',
          campaign_id: 'campaign-456',
          status: 'running',
          summary: { totalTrades: 10 },
        },
      };

      changeCallback(payload);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[StatusMonitor] Error handling campaign run update:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Manual Status Broadcast', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should query database for campaign status', async () => {
      const mockRun = {
        id: 'run-123',
        campaign_id: 'campaign-456',
        status: 'completed',
        summary: {
          totalTrades: 100,
          successfulTrades: 95,
          failedTrades: 5,
        },
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [mockRun],
          error: null,
        }),
      });

      await service.broadcastCampaignStatus('campaign-456');

      // Verify database was queried correctly
      expect(mockSupabase.from).toHaveBeenCalledWith('campaign_runs');
    });

    it('should handle no runs found for campaign', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      });

      await service.broadcastCampaignStatus('campaign-456');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[StatusMonitor] No runs found for campaign campaign-456'
      );
      expect(mockGateway.emitToCampaign).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle database error', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      });

      await service.broadcastCampaignStatus('campaign-456');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[StatusMonitor] No runs found for campaign campaign-456'
      );
      expect(mockGateway.emitToCampaign).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle run without summary', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'run-123',
              campaign_id: 'campaign-456',
              status: 'running',
              summary: null,
            },
          ],
          error: null,
        }),
      });

      await service.broadcastCampaignStatus('campaign-456');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[StatusMonitor] No summary available for run run-123'
      );
      expect(mockGateway.emitToCampaign).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle broadcast errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockRejectedValue(new Error('Query failed')),
      });

      await service.broadcastCampaignStatus('campaign-456');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[StatusMonitor] Error broadcasting status for campaign campaign-456:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
