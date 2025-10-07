import { Test, TestingModule } from '@nestjs/testing';
import { CampaignWebSocketGateway } from './websocket.gateway';
import { Server, Socket } from 'socket.io';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('CampaignWebSocketGateway', () => {
  let gateway: CampaignWebSocketGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CampaignWebSocketGateway],
    }).compile();

    gateway = module.get<CampaignWebSocketGateway>(CampaignWebSocketGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('afterInit', () => {
    it('should log initialization', () => {
      const mockServer = {} as Server;
      const logSpy = vi.spyOn(gateway['logger'], 'log');

      gateway.afterInit(mockServer);

      expect(logSpy).toHaveBeenCalledWith('WebSocket Gateway initialized');
    });
  });

  describe('handleConnection', () => {
    it('should log client connection', () => {
      const mockClient = { id: 'test-client-123' } as Socket;
      const logSpy = vi.spyOn(gateway['logger'], 'log');

      gateway.handleConnection(mockClient);

      expect(logSpy).toHaveBeenCalledWith('Client connected: test-client-123');
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

      expect(logSpy).toHaveBeenCalledWith('Client disconnected: test-client-123');
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
    it('should join campaign room with valid campaign ID', async () => {
      const mockClient = {
        id: 'test-client-123',
        join: vi.fn().mockResolvedValue(undefined),
      } as unknown as Socket;
      const logSpy = vi.spyOn(gateway['logger'], 'log');

      const result = await gateway.handleJoinCampaign(
        { campaignId: 'campaign-abc' },
        mockClient,
      );

      expect(mockClient.join).toHaveBeenCalledWith('campaign:campaign-abc');
      expect(result).toEqual({
        success: true,
        message: 'Successfully joined campaign campaign-abc',
        campaignId: 'campaign-abc',
      });
      expect(logSpy).toHaveBeenCalledWith(
        'Client test-client-123 joined campaign room: campaign:campaign-abc',
      );
    });

    it('should reject invalid campaign ID (missing)', async () => {
      const mockClient = {
        id: 'test-client-123',
        join: vi.fn(),
      } as unknown as Socket;
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
        join: vi.fn(),
      } as unknown as Socket;
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
        join: vi.fn().mockRejectedValue(new Error('Socket error')),
      } as unknown as Socket;
      const errorSpy = vi.spyOn(gateway['logger'], 'error');

      const result = await gateway.handleJoinCampaign(
        { campaignId: 'campaign-abc' },
        mockClient,
      );

      expect(result).toEqual({
        success: false,
        message: 'Failed to join campaign',
      });
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('handleLeaveCampaign', () => {
    it('should leave campaign room with valid campaign ID', async () => {
      const mockClient = {
        id: 'test-client-123',
        leave: vi.fn().mockResolvedValue(undefined),
      } as unknown as Socket;
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
        leave: vi.fn(),
      } as unknown as Socket;
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
        leave: vi.fn().mockRejectedValue(new Error('Socket error')),
      } as unknown as Socket;
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
    it('should emit job status event to campaign room', () => {
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
        timestamp: '2025-10-07T12:00:00Z',
      };

      gateway.emitJobStatus(payload);

      expect(mockServer.to).toHaveBeenCalledWith('campaign:campaign-abc');
      expect(mockServer.emit).toHaveBeenCalledWith('job:status', payload);
      expect(debugSpy).toHaveBeenCalledWith(
        'Emitted job status update for job job-123: succeeded',
      );
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
        timestamp: '2025-10-07T12:00:00Z',
      };

      gateway.emitJobStatus(payload);

      expect(mockServer.to).toHaveBeenCalledWith('campaign:campaign-abc');
      expect(mockServer.emit).toHaveBeenCalledWith('job:status', payload);
    });
  });

  describe('emitRunStatus', () => {
    it('should emit run status event to campaign room', () => {
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
        timestamp: '2025-10-07T12:00:00Z',
      };

      gateway.emitRunStatus(payload);

      expect(mockServer.to).toHaveBeenCalledWith('campaign:campaign-abc');
      expect(mockServer.emit).toHaveBeenCalledWith('run:status', payload);
      expect(debugSpy).toHaveBeenCalledWith(
        'Emitted run status update for run run-456: running',
      );
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
        timestamp: '2025-10-07T13:00:00Z',
      };

      gateway.emitRunStatus(payload);

      expect(mockServer.to).toHaveBeenCalledWith('campaign:campaign-abc');
      expect(mockServer.emit).toHaveBeenCalledWith('run:status', payload);
    });
  });
});
