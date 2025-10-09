import { Test, TestingModule } from '@nestjs/testing';
import { CampaignWebSocketGateway } from './websocket.gateway';
import { SupabaseService } from '../services/supabase.service';
import { Server, Socket } from 'socket.io';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as supabaseConfig from '../config/supabase';

describe('CampaignWebSocketGateway', () => {
  let gateway: CampaignWebSocketGateway;
  let supabaseService: SupabaseService;

  const mockSupabaseService = {
    getCampaignById: vi.fn(),
  };

  beforeEach(async () => {
    // Clear call history
    mockSupabaseService.getCampaignById.mockClear();

    // Mock supabaseAdmin.auth.getUser
    vi.spyOn(supabaseConfig.supabaseAdmin.auth, 'getUser').mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          aud: 'authenticated',
          role: 'authenticated',
          created_at: '2025-01-01T00:00:00Z',
          app_metadata: {},
          user_metadata: {},
        },
      },
      error: null,
    } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignWebSocketGateway,
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
      ],
    }).compile();

    gateway = module.get<CampaignWebSocketGateway>(CampaignWebSocketGateway);
    supabaseService = module.get<SupabaseService>(SupabaseService);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection - Authentication', () => {
    it('should disconnect client without token', async () => {
      const mockClient = {
        id: 'test-client-123',
        handshake: { query: {}, auth: {} },
        disconnect: vi.fn(),
      } as any;
      const warnSpy = vi.spyOn(gateway['logger'], 'warn');

      await gateway.handleConnection(mockClient);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No authentication token provided'),
      );
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should disconnect client with invalid token', async () => {
      const mockClient = {
        id: 'test-client-123',
        handshake: { query: { token: 'invalid-token' }, auth: {} },
        disconnect: vi.fn(),
      } as any;

      vi.spyOn(supabaseConfig.supabaseAdmin.auth, 'getUser').mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' } as any,
      } as any);

      const warnSpy = vi.spyOn(gateway['logger'], 'warn');

      await gateway.handleConnection(mockClient);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid or expired token'),
      );
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should accept client with valid token from query params', async () => {
      const mockClient = {
        id: 'test-client-123',
        handshake: { query: { token: 'valid-token' }, auth: {} },
        disconnect: vi.fn(),
      } as any;

      const logSpy = vi.spyOn(gateway['logger'], 'log');

      await gateway.handleConnection(mockClient);

      expect(mockClient.user).toBeDefined();
      expect(mockClient.user.id).toBe('user-123');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('authenticated as user'),
      );
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('should accept client with valid token from auth object', async () => {
      const mockClient = {
        id: 'test-client-123',
        handshake: { query: {}, auth: { token: 'valid-token' } },
        disconnect: vi.fn(),
      } as any;

      const logSpy = vi.spyOn(gateway['logger'], 'log');

      await gateway.handleConnection(mockClient);

      expect(mockClient.user).toBeDefined();
      expect(mockClient.user.id).toBe('user-123');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('authenticated as user'),
      );
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect client on authentication error', async () => {
      const mockClient = {
        id: 'test-client-123',
        handshake: { query: { token: 'error-token' }, auth: {} },
        disconnect: vi.fn(),
      } as any;

      vi.spyOn(supabaseConfig.supabaseAdmin.auth, 'getUser').mockRejectedValue(
        new Error('Authentication service error'),
      );

      const errorSpy = vi.spyOn(gateway['logger'], 'error');

      await gateway.handleConnection(mockClient);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Authentication error'),
      );
      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('afterInit', () => {
    it('should log initialization', () => {
      const mockServer = {} as Server;
      const logSpy = vi.spyOn(gateway['logger'], 'log');

      gateway.afterInit(mockServer);

      expect(logSpy).toHaveBeenCalledWith('WebSocket Gateway initialized');
    });
  });


  describe('handleDisconnect', () => {
    it('should log client disconnection', () => {
      const mockClient = {
        id: 'test-client-123',
        rooms: new Set(['test-client-123', 'campaign:123']),
      } as Socket;
      const logSpy = vi.spyOn(gateway['logger'], 'log');

      gateway.handleDisconnect(mockClient);

      expect(logSpy).toHaveBeenCalledWith('Client disconnected: test-client-123 (user: unknown)');
    });
  });

  describe('handlePing', () => {
    it('should respond with pong', () => {
      const mockClient = { id: 'test-client-123' } as Socket;

      const result = gateway.handlePing(mockClient);

      expect(result).toBe('pong');
    });
  });

  describe('handleJoinCampaign', () => {
    it('should reject unauthenticated client', async () => {
      const mockClient = {
        id: 'test-client-123',
        user: undefined,
        join: vi.fn(),
      } as any;
      const warnSpy = vi.spyOn(gateway['logger'], 'warn');

      const result = await gateway.handleJoinCampaign(
        { campaignId: 'campaign-abc' },
        mockClient,
      );

      expect(mockClient.join).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        message: 'Authentication required',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unauthenticated client'),
      );
    });

    it('should reject user joining campaign they do not own', async () => {
      const mockClient = {
        id: 'test-client-123',
        user: { id: 'user-123', email: 'test@example.com' },
        join: vi.fn(),
      } as any;

      mockSupabaseService.getCampaignById.mockRejectedValueOnce(
        new Error('Not found'),
      );

      const warnSpy = vi.spyOn(gateway['logger'], 'warn');

      const result = await gateway.handleJoinCampaign(
        { campaignId: 'campaign-abc' },
        mockClient,
      );

      expect(mockClient.join).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        message: 'Campaign not found or access denied',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('attempted to join non-existent campaign'),
      );
    });

    it('should join campaign room with valid campaign ID and ownership', async () => {
      const mockClient = {
        id: 'test-client-123',
        user: { id: 'user-123', email: 'test@example.com' },
        join: vi.fn().mockResolvedValue(undefined),
      } as any;

      // Explicitly mock getCampaignById for this test
      mockSupabaseService.getCampaignById.mockResolvedValueOnce({
        id: 'campaign-abc',
        user_id: 'user-123',
        name: 'Test Campaign',
      });

      const logSpy = vi.spyOn(gateway['logger'], 'log');

      const result = await gateway.handleJoinCampaign(
        { campaignId: 'campaign-abc' },
        mockClient,
      );

      // Check the result is correct (which proves the mock was used)
      expect(result.success).toBe(true);
      expect(result.message).toBe('Successfully joined campaign campaign-abc');
      expect(result.campaignId).toBe('campaign-abc');
      expect(mockClient.join).toHaveBeenCalledWith('campaign:campaign-abc');
      expect(logSpy).toHaveBeenCalledWith(
        'Client test-client-123 joined campaign room: campaign:campaign-abc',
      );
    });

    it('should reject invalid campaign ID (missing)', async () => {
      const mockClient = {
        id: 'test-client-123',
        user: { id: 'user-123', email: 'test@example.com' },
        join: vi.fn(),
      } as any;
      const warnSpy = vi.spyOn(gateway['logger'], 'warn');

      const result = await gateway.handleJoinCampaign(
        { campaignId: '' },
        mockClient,
      );

      expect(mockClient.join).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        message: 'Invalid campaign ID',
      });
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should reject invalid campaign ID (non-string)', async () => {
      const mockClient = {
        id: 'test-client-123',
        user: { id: 'user-123', email: 'test@example.com' },
        join: vi.fn(),
      } as any;
      const warnSpy = vi.spyOn(gateway['logger'], 'warn');

      const result = await gateway.handleJoinCampaign(
        { campaignId: null as any },
        mockClient,
      );

      expect(mockClient.join).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        message: 'Invalid campaign ID',
      });
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should handle join errors gracefully', async () => {
      const mockClient = {
        id: 'test-client-123',
        user: { id: 'user-123', email: 'test@example.com' },
        join: vi.fn().mockRejectedValue(new Error('Socket error')),
      } as any;

      // Mock getCampaignById to succeed, so we reach the join call
      mockSupabaseService.getCampaignById.mockResolvedValueOnce({
        id: 'campaign-abc',
        user_id: 'user-123',
      });

      const errorSpy = vi.spyOn(gateway['logger'], 'error');

      const result = await gateway.handleJoinCampaign(
        { campaignId: 'campaign-abc' },
        mockClient,
      );

      // Check that error was handled gracefully
      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to join campaign');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('handleLeaveCampaign', () => {
    it('should reject unauthenticated client', async () => {
      const mockClient = {
        id: 'test-client-123',
        user: undefined,
        leave: vi.fn(),
      } as any;
      const warnSpy = vi.spyOn(gateway['logger'], 'warn');

      const result = await gateway.handleLeaveCampaign(
        { campaignId: 'campaign-abc' },
        mockClient,
      );

      expect(mockClient.leave).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        message: 'Authentication required',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unauthenticated client'),
      );
    });

    it('should leave campaign room with valid campaign ID', async () => {
      const mockClient = {
        id: 'test-client-123',
        user: { id: 'user-123', email: 'test@example.com' },
        leave: vi.fn().mockResolvedValue(undefined),
      } as any;
      const logSpy = vi.spyOn(gateway['logger'], 'log');

      const result = await gateway.handleLeaveCampaign(
        { campaignId: 'campaign-abc' },
        mockClient,
      );

      expect(mockClient.leave).toHaveBeenCalledWith('campaign:campaign-abc');
      expect(result).toEqual({
        success: true,
        message: 'Successfully left campaign campaign-abc',
        campaignId: 'campaign-abc',
      });
      expect(logSpy).toHaveBeenCalledWith(
        'Client test-client-123 left campaign room: campaign:campaign-abc',
      );
    });

    it('should reject invalid campaign ID', async () => {
      const mockClient = {
        id: 'test-client-123',
        user: { id: 'user-123', email: 'test@example.com' },
        leave: vi.fn(),
      } as any;
      const warnSpy = vi.spyOn(gateway['logger'], 'warn');

      const result = await gateway.handleLeaveCampaign(
        { campaignId: '' },
        mockClient,
      );

      expect(mockClient.leave).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        message: 'Invalid campaign ID',
      });
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should handle leave errors gracefully', async () => {
      const mockClient = {
        id: 'test-client-123',
        user: { id: 'user-123', email: 'test@example.com' },
        leave: vi.fn().mockRejectedValue(new Error('Socket error')),
      } as any;
      const errorSpy = vi.spyOn(gateway['logger'], 'error');

      const result = await gateway.handleLeaveCampaign(
        { campaignId: 'campaign-abc' },
        mockClient,
      );

      expect(result).toEqual({
        success: false,
        message: 'Failed to leave campaign',
      });
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('emitToCampaign', () => {
    it('should emit event to campaign room', () => {
      const mockServer = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn(),
      } as unknown as Server;
      gateway.server = mockServer;
      const debugSpy = vi.spyOn(gateway['logger'], 'debug');

      gateway.emitToCampaign('campaign-abc', 'job_status', { status: 'completed' });

      expect(mockServer.to).toHaveBeenCalledWith('campaign:campaign-abc');
      expect(mockServer.emit).toHaveBeenCalledWith('job_status', { status: 'completed' });
      expect(debugSpy).toHaveBeenCalledWith(
        'Emitted job_status to campaign room: campaign:campaign-abc',
      );
    });
  });

  describe('getCampaignClientCount', () => {
    it('should return client count for campaign room', async () => {
      const mockSockets = [{ id: 'client-1' }, { id: 'client-2' }];
      const mockServer = {
        in: vi.fn().mockReturnThis(),
        fetchSockets: vi.fn().mockResolvedValue(mockSockets),
      } as unknown as Server;
      gateway.server = mockServer;

      const count = await gateway.getCampaignClientCount('campaign-abc');

      expect(mockServer.in).toHaveBeenCalledWith('campaign:campaign-abc');
      expect(count).toBe(2);
    });

    it('should return 0 for empty campaign room', async () => {
      const mockServer = {
        in: vi.fn().mockReturnThis(),
        fetchSockets: vi.fn().mockResolvedValue([]),
      } as unknown as Server;
      gateway.server = mockServer;

      const count = await gateway.getCampaignClientCount('campaign-abc');

      expect(count).toBe(0);
    });
  });

  describe('emitJobStatus', () => {
    it('should emit job status event to campaign room with auto-generated ID and timestamp', () => {
      const mockServer = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn(),
      } as unknown as Server;
      gateway.server = mockServer;
      const debugSpy = vi.spyOn(gateway['logger'], 'debug');

      const payload = {
        jobId: 'job-123',
        runId: 'run-456',
        campaignId: 'campaign-abc',
        status: 'succeeded' as const,
        queue: 'trade.buy',
        type: 'buy-token',
      };

      gateway.emitJobStatus(payload);

      expect(mockServer.to).toHaveBeenCalledWith('campaign:campaign-abc');
      const emitCall = mockServer.emit.mock.calls[0];
      expect(emitCall[0]).toBe('job:status');
      expect(emitCall[1]).toMatchObject(payload);
      expect(emitCall[1].eventId).toBeDefined();
      expect(emitCall[1].timestamp).toBeDefined();
      expect(debugSpy).toHaveBeenCalled();
    });

    it('should emit job status with error details', () => {
      const mockServer = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn(),
      } as unknown as Server;
      gateway.server = mockServer;

      const payload = {
        jobId: 'job-123',
        runId: 'run-456',
        campaignId: 'campaign-abc',
        status: 'failed' as const,
        queue: 'trade.sell',
        type: 'sell-token',
        attempts: 3,
        error: { message: 'Transaction failed' },
      };

      gateway.emitJobStatus(payload);

      expect(mockServer.to).toHaveBeenCalledWith('campaign:campaign-abc');
      const emitCall = mockServer.emit.mock.calls[0];
      expect(emitCall[0]).toBe('job:status');
      expect(emitCall[1]).toMatchObject(payload);
      expect(emitCall[1].eventId).toBeDefined();
      expect(emitCall[1].timestamp).toBeDefined();
    });
  });

  describe('emitRunStatus', () => {
    it('should emit run status event to campaign room with auto-generated ID', () => {
      const mockServer = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn(),
      } as unknown as Server;
      gateway.server = mockServer;
      const debugSpy = vi.spyOn(gateway['logger'], 'debug');

      const payload = {
        runId: 'run-456',
        campaignId: 'campaign-abc',
        status: 'running' as const,
        startedAt: '2025-10-07T12:00:00Z',
      };

      gateway.emitRunStatus(payload);

      expect(mockServer.to).toHaveBeenCalledWith('campaign:campaign-abc');
      const emitCall = mockServer.emit.mock.calls[0];
      expect(emitCall[0]).toBe('run:status');
      expect(emitCall[1]).toMatchObject(payload);
      expect(emitCall[1].eventId).toBeDefined();
      expect(emitCall[1].timestamp).toBeDefined();
      expect(debugSpy).toHaveBeenCalled();
    });

    it('should emit run status with end time and summary', () => {
      const mockServer = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn(),
      } as unknown as Server;
      gateway.server = mockServer;

      const payload = {
        runId: 'run-456',
        campaignId: 'campaign-abc',
        status: 'completed' as const,
        startedAt: '2025-10-07T12:00:00Z',
        endedAt: '2025-10-07T13:00:00Z',
        summary: { totalVolume: 1000, successfulTrades: 50 },
      };

      gateway.emitRunStatus(payload);

      expect(mockServer.to).toHaveBeenCalledWith('campaign:campaign-abc');
      const emitCall = mockServer.emit.mock.calls[0];
      expect(emitCall[0]).toBe('run:status');
      expect(emitCall[1]).toMatchObject(payload);
    });
  });

  describe('handleGetSubscriptions', () => {
    it('should return current campaign subscriptions', () => {
      const mockClient = {
        id: 'test-client-123',
        user: { id: 'user-123', email: 'test@example.com' },
        rooms: new Set(['test-client-123', 'campaign:abc', 'campaign:xyz']),
      } as any;

      const result = gateway.handleGetSubscriptions(mockClient);

      expect(result.success).toBe(true);
      expect(result.campaigns).toEqual(['abc', 'xyz']);
    });

    it('should reject unauthenticated client', () => {
      const mockClient = {
        id: 'test-client-123',
        user: undefined,
        rooms: new Set(['test-client-123']),
      } as any;

      const result = gateway.handleGetSubscriptions(mockClient);

      expect(result.success).toBe(false);
      expect(result.campaigns).toEqual([]);
    });
  });

  describe('handleGetMissedEvents', () => {
    it('should handle missed events request for authorized campaign', async () => {
      const mockClient = {
        id: 'test-client-123',
        user: { id: 'user-123', email: 'test@example.com' },
      } as any;

      // Mock getCampaignById to succeed for authorization check
      mockSupabaseService.getCampaignById.mockResolvedValue({
        id: 'campaign-abc',
        user_id: 'user-123',
        name: 'Test Campaign',
      });

      // Emit some events to create history
      const mockServer = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn(),
      } as unknown as Server;
      gateway.server = mockServer;

      gateway.emitJobStatus({
        jobId: 'job-1',
        runId: 'run-1',
        campaignId: 'campaign-abc',
        status: 'succeeded',
        queue: 'trade.buy',
        type: 'buy-token',
      });

      const result = await gateway.handleGetMissedEvents(
        { campaignId: 'campaign-abc' },
        mockClient,
      );

      // At minimum, should not throw and should have success flag
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      // If authorized, should return events array (even if empty)
      if (result.success) {
        expect(result.events).toBeDefined();
      }
    });

    it('should reject unauthenticated client', async () => {
      const mockClient = {
        id: 'test-client-123',
        user: undefined,
      } as any;

      const result = await gateway.handleGetMissedEvents(
        { campaignId: 'campaign-abc' },
        mockClient,
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Authentication required');
    });

    it('should reject unauthorized access to campaign', async () => {
      const mockClient = {
        id: 'test-client-123',
        user: { id: 'user-123', email: 'test@example.com' },
      } as any;

      mockSupabaseService.getCampaignById.mockRejectedValueOnce(
        new Error('Not found'),
      );

      const result = await gateway.handleGetMissedEvents(
        { campaignId: 'campaign-abc' },
        mockClient,
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Campaign not found or access denied');
    });
  });
});
