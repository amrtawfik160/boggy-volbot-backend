import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { CampaignsController } from '../campaigns.controller';
import { SupabaseService } from '../../../services/supabase.service';
import { CampaignWebSocketGateway } from '../../../websocket/websocket.gateway';
import { Queue } from 'bullmq';

// Mock BullMQ Queue
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    getJobs: vi.fn(),
    getWaitingCount: vi.fn(),
    getActiveCount: vi.fn(),
  })),
}));

// Mock IORedis
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    connect: vi.fn(),
  })),
}));

describe('CampaignsController Integration Tests', () => {
  let controller: CampaignsController;
  let supabaseService: SupabaseService;
  let gateway: CampaignWebSocketGateway;
  let gatherQueue: any;
  let tradeBuyQueue: any;
  let tradeSellQueue: any;
  let distributeQueue: any;
  let fundsGatherQueue: any;

  const mockUser = { id: 'test-user-123' };

  const mockSupabaseService = {
    getCampaignsByUserId: vi.fn(),
    getCampaignById: vi.fn(),
    getTokenById: vi.fn(),
    createCampaign: vi.fn(),
    updateCampaign: vi.fn(),
    createCampaignRun: vi.fn(),
    updateCampaignRun: vi.fn(),
    getCampaignRunsByCampaignId: vi.fn(),
    getCampaignLogs: vi.fn(),
    createJob: vi.fn(),
    getWalletsByUserId: vi.fn(),
    getUserSettings: vi.fn(),
  };

  const mockGateway = {
    emitRunStatus: vi.fn(),
    emitJobStatus: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CampaignsController],
      providers: [
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
        {
          provide: CampaignWebSocketGateway,
          useValue: mockGateway,
        },
      ],
    }).compile();

    controller = module.get<CampaignsController>(CampaignsController);
    supabaseService = module.get<SupabaseService>(SupabaseService);
    gateway = module.get<CampaignWebSocketGateway>(CampaignWebSocketGateway);

    // Access the queue instances from the controller
    gatherQueue = (controller as any).gatherQueue;
    tradeBuyQueue = (controller as any).tradeBuyQueue;
    tradeSellQueue = (controller as any).tradeSellQueue;
    distributeQueue = (controller as any).distributeQueue;
    fundsGatherQueue = (controller as any).fundsGatherQueue;

    vi.clearAllMocks();
  });

  describe('listCampaigns', () => {
    it('should return all campaigns for a user', async () => {
      const mockCampaigns = [
        { id: 'c1', user_id: mockUser.id, name: 'Campaign 1', status: 'active' },
        { id: 'c2', user_id: mockUser.id, name: 'Campaign 2', status: 'draft' },
      ];

      mockSupabaseService.getCampaignsByUserId.mockResolvedValue(mockCampaigns);

      const result = await controller.listCampaigns(mockUser);

      expect(result).toEqual(mockCampaigns);
      expect(mockSupabaseService.getCampaignsByUserId).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('getCampaign', () => {
    it('should return a specific campaign', async () => {
      const mockCampaign = { id: 'c1', user_id: mockUser.id, name: 'Campaign 1' };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);

      const result = await controller.getCampaign('c1', mockUser);

      expect(result).toEqual(mockCampaign);
      expect(mockSupabaseService.getCampaignById).toHaveBeenCalledWith('c1', mockUser.id);
    });
  });

  describe('createCampaign', () => {
    it('should create a new campaign', async () => {
      const dto = {
        name: 'New Campaign',
        token_id: 't1',
        pool_id: 'p1',
        params: { duration: 60 },
      };

      const mockToken = { id: 't1', mint: 'mint1', name: 'Token 1' };
      const mockCampaign = {
        id: 'c1',
        user_id: mockUser.id,
        name: dto.name,
        token_id: dto.token_id,
        pool_id: dto.pool_id,
        params: dto.params,
        status: 'draft',
      };

      mockSupabaseService.getTokenById.mockResolvedValue(mockToken);
      mockSupabaseService.createCampaign.mockResolvedValue(mockCampaign);

      const result = await controller.createCampaign(dto, mockUser);

      expect(result).toEqual(mockCampaign);
      expect(mockSupabaseService.getTokenById).toHaveBeenCalledWith(dto.token_id);
      expect(mockSupabaseService.createCampaign).toHaveBeenCalledWith({
        user_id: mockUser.id,
        name: dto.name,
        token_id: dto.token_id,
        pool_id: dto.pool_id,
        params: dto.params,
        status: 'draft',
      });
    });

    it('should throw error when token does not exist', async () => {
      const dto = {
        name: 'New Campaign',
        token_id: 'invalid-token',
        pool_id: 'p1',
        params: {},
      };

      mockSupabaseService.getTokenById.mockResolvedValue(null);

      await expect(controller.createCampaign(dto, mockUser)).rejects.toThrow(
        new HttpException('Token not found', HttpStatus.NOT_FOUND)
      );
    });
  });

  describe('updateCampaign', () => {
    it('should update campaign with new data', async () => {
      const dto = { name: 'Updated Campaign', status: 'active' };
      const updatedCampaign = { id: 'c1', ...dto };

      mockSupabaseService.updateCampaign.mockResolvedValue(updatedCampaign);

      const result = await controller.updateCampaign('c1', dto, mockUser);

      expect(result).toEqual(updatedCampaign);
      expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith('c1', mockUser.id, dto);
    });
  });

  describe('startCampaign', () => {
    it('should start a campaign and create initial jobs', async () => {
      const mockCampaign = {
        id: 'c1',
        pool_id: 'p1',
        status: 'draft',
      };
      const mockRun = {
        id: 'r1',
        campaign_id: 'c1',
        status: 'running',
        started_at: new Date(),
      };
      const mockWallets = [
        { id: 'w1', address: 'addr1' },
        { id: 'w2', address: 'addr2' },
      ];
      const mockSettings = {
        trading_config: {
          buyLowerAmount: 0.001,
          buyUpperAmount: 0.002,
        },
      };
      const mockDbJob = { id: 'j1', queue: 'gather', status: 'queued' };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.createJob.mockResolvedValue(mockDbJob);
      mockSupabaseService.getWalletsByUserId.mockResolvedValue(mockWallets);
      mockSupabaseService.getUserSettings.mockResolvedValue(mockSettings);
      gatherQueue.add.mockResolvedValue({});
      tradeBuyQueue.add.mockResolvedValue({});
      tradeSellQueue.add.mockResolvedValue({});

      const result = await controller.startCampaign('c1', mockUser);

      expect(result).toEqual({ campaign: { ...mockCampaign, status: 'active' }, run: mockRun });
      expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith('c1', mockUser.id, {
        status: 'active',
      });
      expect(mockSupabaseService.createCampaignRun).toHaveBeenCalled();
      expect(mockGateway.emitRunStatus).toHaveBeenCalled();
      expect(gatherQueue.add).toHaveBeenCalled();
      expect(tradeBuyQueue.add).toHaveBeenCalledTimes(2);
      expect(tradeSellQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should throw error when campaign not found', async () => {
      mockSupabaseService.getCampaignById.mockResolvedValue(null);

      await expect(controller.startCampaign('c1', mockUser)).rejects.toThrow(
        new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
      );
    });
  });

  describe('pauseCampaign', () => {
    it('should pause a campaign and remove queued jobs', async () => {
      const mockCampaign = { id: 'c1', status: 'active' };
      const mockRun = {
        id: 'r1',
        status: 'running',
        started_at: new Date(),
      };
      const updatedRun = { ...mockRun, status: 'paused' };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'paused' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue(updatedRun);
      gatherQueue.getJobs.mockResolvedValue([]);
      tradeBuyQueue.getJobs.mockResolvedValue([]);
      tradeSellQueue.getJobs.mockResolvedValue([]);

      const result = await controller.pauseCampaign('c1', mockUser);

      expect(result).toEqual({ status: 'paused' });
      expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith('c1', mockUser.id, {
        status: 'paused',
      });
      expect(mockGateway.emitRunStatus).toHaveBeenCalled();
    });
  });

  describe('resumeCampaign', () => {
    it('should resume a paused campaign', async () => {
      const mockCampaign = { id: 'c1', status: 'paused' };
      const mockRun = {
        id: 'r1',
        status: 'paused',
        started_at: new Date(),
      };
      const mockWallets = [{ id: 'w1', address: 'addr1' }];
      const mockSettings = { trading_config: {} };
      const mockDbJob = { id: 'j1', queue: 'trade.buy', status: 'queued' };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({ ...mockRun, status: 'running' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue(mockWallets);
      mockSupabaseService.getUserSettings.mockResolvedValue(mockSettings);
      mockSupabaseService.createJob.mockResolvedValue(mockDbJob);
      tradeBuyQueue.add.mockResolvedValue({});
      tradeSellQueue.add.mockResolvedValue({});

      const result = await controller.resumeCampaign('c1', mockUser);

      expect(result).toEqual({ status: 'resumed' });
      expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith('c1', mockUser.id, {
        status: 'active',
      });
    });

    it('should throw error when campaign is not paused', async () => {
      const mockCampaign = { id: 'c1', status: 'active' };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);

      await expect(controller.resumeCampaign('c1', mockUser)).rejects.toThrow(
        new HttpException('Campaign must be paused to resume', HttpStatus.BAD_REQUEST)
      );
    });
  });

  describe('stopCampaign', () => {
    it('should stop a campaign and clean up jobs', async () => {
      const mockCampaign = { id: 'c1', status: 'active' };
      const mockRun = {
        id: 'r1',
        status: 'running',
        started_at: new Date(),
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'stopped' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({
        ...mockRun,
        status: 'stopped',
        ended_at: expect.any(Date),
      });
      gatherQueue.getJobs.mockResolvedValue([]);
      tradeBuyQueue.getJobs.mockResolvedValue([]);
      tradeSellQueue.getJobs.mockResolvedValue([]);

      const result = await controller.stopCampaign('c1', mockUser);

      expect(result).toEqual({ status: 'stopped' });
      expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith('c1', mockUser.id, {
        status: 'stopped',
      });
    });
  });

  describe('getCampaignRuns', () => {
    it('should return all runs for a campaign', async () => {
      const mockCampaign = { id: 'c1', user_id: mockUser.id };
      const mockRuns = [
        { id: 'r1', campaign_id: 'c1', status: 'completed' },
        { id: 'r2', campaign_id: 'c1', status: 'running' },
      ];

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue(mockRuns);

      const result = await controller.getCampaignRuns('c1', mockUser);

      expect(result).toEqual(mockRuns);
    });
  });

  describe('getCampaignLogs', () => {
    it('should return campaign logs with default limit', async () => {
      const mockCampaign = { id: 'c1', user_id: mockUser.id };
      const mockLogs = [
        { id: 'l1', message: 'Log 1', timestamp: new Date() },
        { id: 'l2', message: 'Log 2', timestamp: new Date() },
      ];

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getCampaignLogs.mockResolvedValue(mockLogs);

      const result = await controller.getCampaignLogs('c1', mockUser);

      expect(result).toEqual(mockLogs);
      expect(mockSupabaseService.getCampaignLogs).toHaveBeenCalledWith('c1', 100);
    });

    it('should respect custom limit parameter', async () => {
      const mockCampaign = { id: 'c1', user_id: mockUser.id };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getCampaignLogs.mockResolvedValue([]);

      await controller.getCampaignLogs('c1', mockUser, '50');

      expect(mockSupabaseService.getCampaignLogs).toHaveBeenCalledWith('c1', 50);
    });
  });

  describe('getCampaignStatus', () => {
    it('should return campaign status with queue stats', async () => {
      const mockCampaign = { id: 'c1', status: 'active' };
      const mockRuns = [{ id: 'r1', status: 'running' }];

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue(mockRuns);
      gatherQueue.getWaitingCount.mockResolvedValue(2);
      gatherQueue.getActiveCount.mockResolvedValue(1);
      tradeBuyQueue.getWaitingCount.mockResolvedValue(5);
      tradeBuyQueue.getActiveCount.mockResolvedValue(3);
      tradeSellQueue.getWaitingCount.mockResolvedValue(4);
      tradeSellQueue.getActiveCount.mockResolvedValue(2);

      const result = await controller.getCampaignStatus('c1', mockUser);

      expect(result).toEqual({
        campaign: mockCampaign,
        latestRun: mockRuns[0],
        queueStats: {
          gather: { waiting: 2, active: 1 },
          buy: { waiting: 5, active: 3 },
          sell: { waiting: 4, active: 2 },
        },
      });
    });
  });

  describe('distribute', () => {
    it('should create distribute job with default wallet count', async () => {
      const mockCampaign = { id: 'c1', user_id: mockUser.id };
      const mockRun = { id: 'r1', status: 'running', started_at: new Date() };
      const mockDbJob = { id: 'j1', queue: 'distribute', status: 'queued' };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.createJob.mockResolvedValue(mockDbJob);
      distributeQueue.add.mockResolvedValue({});

      const result = await controller.distribute('c1', mockUser, {});

      expect(result.status).toBe('queued');
      expect(result.distributionNum).toBe(5); // Default value
      expect(distributeQueue.add).toHaveBeenCalled();
    });

    it('should validate wallet count is within valid range', async () => {
      const mockCampaign = { id: 'c1', user_id: mockUser.id };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);

      await expect(
        controller.distribute('c1', mockUser, { num_wallets: 101 })
      ).rejects.toThrow(new HttpException('num_wallets must be between 1 and 100', HttpStatus.BAD_REQUEST));
    });
  });

  describe('startSellOnly', () => {
    it('should start sell-only mode with default total_times', async () => {
      const mockCampaign = { id: 'c1', user_id: mockUser.id };
      const mockRun = { id: 'r1', status: 'running', started_at: new Date() };
      const mockWallets = [{ id: 'w1', address: 'addr1' }];
      const mockSettings = { sell_config: { sellAllByTimes: 1 } };
      const mockDbJob = { id: 'j1', queue: 'trade.sell', status: 'queued' };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getUserSettings.mockResolvedValue(mockSettings);
      mockSupabaseService.updateCampaign.mockResolvedValue(mockCampaign);
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.getWalletsByUserId.mockResolvedValue(mockWallets);
      mockSupabaseService.createJob.mockResolvedValue(mockDbJob);
      tradeSellQueue.add.mockResolvedValue({});

      const result = await controller.startSellOnly('c1', mockUser, {});

      expect(result.status).toBe('queued');
      expect(result.totalTimes).toBe(1);
      expect(result.walletsQueued).toBe(1);
    });

    it('should validate total_times is within range', async () => {
      const mockCampaign = { id: 'c1', user_id: mockUser.id };
      const mockSettings = {};

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getUserSettings.mockResolvedValue(mockSettings);

      await expect(
        controller.startSellOnly('c1', mockUser, { total_times: 25 })
      ).rejects.toThrow(new HttpException('total_times must be between 1 and 20', HttpStatus.BAD_REQUEST));
    });
  });

  describe('gatherFunds', () => {
    it('should create funds gather job', async () => {
      const mockCampaign = { id: 'c1', user_id: mockUser.id };
      const mockRun = { id: 'r1', status: 'running', started_at: new Date() };
      const mockDbJob = { id: 'j1', queue: 'funds.gather', status: 'queued' };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.createJob.mockResolvedValue(mockDbJob);
      fundsGatherQueue.add.mockResolvedValue({});

      const result = await controller.gatherFunds('c1', mockUser);

      expect(result).toEqual({ status: 'queued' });
      expect(fundsGatherQueue.add).toHaveBeenCalled();
    });
  });
});
