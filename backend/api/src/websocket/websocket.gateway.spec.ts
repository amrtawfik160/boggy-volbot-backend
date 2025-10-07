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
      const mockClient = { id: 'test-client-123' } as Socket;
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
});
