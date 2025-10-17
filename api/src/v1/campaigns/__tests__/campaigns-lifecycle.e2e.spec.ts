import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { CampaignsController } from '../campaigns.controller';
import { SupabaseService } from '../../../services/supabase.service';
import { CampaignWebSocketGateway } from '../../../websocket/websocket.gateway';
import { Queue } from 'bullmq';

/**
 * End-to-End Test Suite for Campaign Lifecycle
 *
 * This suite simulates real user workflows including:
 * - Complete campaign lifecycle (create → start → monitor → stop)
 * - Campaign pause and resume operations
 * - Fund distribution workflow
 * - Sell-only mode operation
 * - Funds gathering
 * - Error scenarios and edge cases
 */

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

describe('Campaign Lifecycle E2E Tests', () => {
  let controller: CampaignsController;
  let supabaseService: SupabaseService;
  let gateway: CampaignWebSocketGateway;
  let gatherQueue: any;
  let tradeBuyQueue: any;
  let tradeSellQueue: any;
  let distributeQueue: any;
  let fundsGatherQueue: any;

  const mockUser = { id: 'test-user-e2e-123' };

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
    // Create fresh mock queue instances for each test
    gatherQueue = {
      add: vi.fn(),
      getJobs: vi.fn(),
      getWaitingCount: vi.fn(),
      getActiveCount: vi.fn(),
    };

    tradeBuyQueue = {
      add: vi.fn(),
      getJobs: vi.fn(),
      getWaitingCount: vi.fn(),
      getActiveCount: vi.fn(),
    };

    tradeSellQueue = {
      add: vi.fn(),
      getJobs: vi.fn(),
      getWaitingCount: vi.fn(),
      getActiveCount: vi.fn(),
    };

    distributeQueue = {
      add: vi.fn(),
      getJobs: vi.fn(),
      getWaitingCount: vi.fn(),
      getActiveCount: vi.fn(),
    };

    fundsGatherQueue = {
      add: vi.fn(),
      getJobs: vi.fn(),
      getWaitingCount: vi.fn(),
      getActiveCount: vi.fn(),
    };

    // Manually instantiate controller with mocked dependencies
    controller = new CampaignsController(
      mockSupabaseService as any,
      mockGateway as any,
    );

    // Inject mock queues into controller
    (controller as any).gatherQueue = gatherQueue;
    (controller as any).tradeBuyQueue = tradeBuyQueue;
    (controller as any).tradeSellQueue = tradeSellQueue;
    (controller as any).distributeQueue = distributeQueue;
    (controller as any).fundsGatherQueue = fundsGatherQueue;

    supabaseService = mockSupabaseService as any;
    gateway = mockGateway as any;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('E2E Scenario 1: Complete Campaign Lifecycle', () => {
    it('should successfully execute full campaign lifecycle: create → start → monitor → stop', async () => {
      // Step 1: Create Campaign
      const createDto = {
        name: 'E2E Test Campaign',
        token_id: 'token-e2e-1',
        pool_id: 'pool-e2e-1',
        params: { duration: 3600, target_volume: 10000 },
      };

      const mockToken = { id: 'token-e2e-1', mint: 'mint-e2e-1', name: 'E2E Token' };
      const mockCampaign = {
        id: 'campaign-e2e-1',
        user_id: mockUser.id,
        name: createDto.name,
        token_id: createDto.token_id,
        pool_id: createDto.pool_id,
        params: createDto.params,
        status: 'draft',
        created_at: new Date(),
      };

      mockSupabaseService.getTokenById.mockResolvedValue(mockToken);
      mockSupabaseService.createCampaign.mockResolvedValue(mockCampaign);

      const createdCampaign = await controller.createCampaign(createDto, mockUser);

      expect(createdCampaign).toBeDefined();
      expect(createdCampaign.status).toBe('draft');
      expect(createdCampaign.name).toBe(createDto.name);
      expect(mockSupabaseService.createCampaign).toHaveBeenCalledWith({
        user_id: mockUser.id,
        name: createDto.name,
        token_id: createDto.token_id,
        pool_id: createDto.pool_id,
        params: createDto.params,
        status: 'draft',
      });

      // Step 2: Start Campaign
      const mockRun = {
        id: 'run-e2e-1',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      };

      const mockWallets = [
        { id: 'wallet-e2e-1', address: 'addr-e2e-1' },
        { id: 'wallet-e2e-2', address: 'addr-e2e-2' },
        { id: 'wallet-e2e-3', address: 'addr-e2e-3' },
      ];

      const mockSettings = {
        trading_config: {
          buyLowerAmount: 0.001,
          buyUpperAmount: 0.005,
        },
      };

      const mockDbJob = { id: 'job-e2e-1', queue: 'gather', status: 'queued' };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockImplementation((id, userId, updates) =>
        Promise.resolve({ ...mockCampaign, ...updates })
      );
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.createJob.mockResolvedValue(mockDbJob);
      mockSupabaseService.getWalletsByUserId.mockResolvedValue(mockWallets);
      mockSupabaseService.getUserSettings.mockResolvedValue(mockSettings);
      gatherQueue.add.mockResolvedValue({});
      tradeBuyQueue.add.mockResolvedValue({});
      tradeSellQueue.add.mockResolvedValue({});

      const startResult = await controller.startCampaign(mockCampaign.id, mockUser);

      expect(startResult).toBeDefined();
      expect(startResult.campaign).toBeDefined();
      expect(startResult.run).toBeDefined();
      expect(startResult.run.status).toBe('running');
      expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith(mockCampaign.id, mockUser.id, {
        status: 'active',
      });
      expect(gatherQueue.add).toHaveBeenCalledWith('gather-pool-info', expect.objectContaining({
        runId: mockRun.id,
        campaignId: mockCampaign.id,
        poolId: mockCampaign.pool_id,
      }));
      expect(tradeBuyQueue.add).toHaveBeenCalledTimes(mockWallets.length);
      expect(tradeSellQueue.add).toHaveBeenCalledTimes(mockWallets.length);
      expect(mockGateway.emitRunStatus).toHaveBeenCalledWith({
        runId: mockRun.id,
        campaignId: mockCampaign.id,
        status: 'running',
        startedAt: mockRun.started_at,
      });

      // Step 3: Monitor Campaign Status
      const runningCampaign = { ...mockCampaign, status: 'active' };
      mockSupabaseService.getCampaignById.mockResolvedValue(runningCampaign);
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
      gatherQueue.getWaitingCount.mockResolvedValue(2);
      gatherQueue.getActiveCount.mockResolvedValue(1);
      tradeBuyQueue.getWaitingCount.mockResolvedValue(5);
      tradeBuyQueue.getActiveCount.mockResolvedValue(3);
      tradeSellQueue.getWaitingCount.mockResolvedValue(4);
      tradeSellQueue.getActiveCount.mockResolvedValue(2);

      const statusResult = await controller.getCampaignStatus(mockCampaign.id, mockUser);

      expect(statusResult).toBeDefined();
      expect(statusResult.campaign.status).toBe('active');
      expect(statusResult.latestRun).toBeDefined();
      expect(statusResult.latestRun.status).toBe('running');
      expect(statusResult.queueStats).toEqual({
        gather: { waiting: 2, active: 1 },
        buy: { waiting: 5, active: 3 },
        sell: { waiting: 4, active: 2 },
      });

      // Step 4: Stop Campaign
      const stoppedRun = {
        ...mockRun,
        status: 'stopped',
        ended_at: new Date(),
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(runningCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...runningCampaign, status: 'stopped' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue(stoppedRun);
      gatherQueue.getJobs.mockResolvedValue([]);
      tradeBuyQueue.getJobs.mockResolvedValue([]);
      tradeSellQueue.getJobs.mockResolvedValue([]);

      const stopResult = await controller.stopCampaign(mockCampaign.id, mockUser);

      expect(stopResult).toEqual({ status: 'stopped' });
      expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith(mockCampaign.id, mockUser.id, {
        status: 'stopped',
      });
      expect(mockSupabaseService.updateCampaignRun).toHaveBeenCalledWith(mockRun.id, {
        status: 'stopped',
        ended_at: expect.any(Date),
      });
      expect(mockGateway.emitRunStatus).toHaveBeenCalledWith({
        runId: stoppedRun.id,
        campaignId: mockCampaign.id,
        status: 'stopped',
        startedAt: stoppedRun.started_at,
        endedAt: stoppedRun.ended_at,
      });

      // Verify final campaign state
      mockSupabaseService.getCampaignById.mockResolvedValue({ ...runningCampaign, status: 'stopped' });
      const finalCampaign = await controller.getCampaign(mockCampaign.id, mockUser);
      expect(finalCampaign.status).toBe('stopped');
    });
  });

  describe('E2E Scenario 2: Campaign Pause and Resume Workflow', () => {
    it('should successfully pause and resume a running campaign', async () => {
      const mockCampaign = {
        id: 'campaign-pause-1',
        user_id: mockUser.id,
        name: 'Pause Resume Test',
        pool_id: 'pool-pause-1',
        status: 'active',
      };

      const mockRun = {
        id: 'run-pause-1',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      };

      const mockWallets = [
        { id: 'wallet-pause-1', address: 'addr-pause-1' },
        { id: 'wallet-pause-2', address: 'addr-pause-2' },
      ];

      const mockSettings = {
        trading_config: {
          buyLowerAmount: 0.002,
          buyUpperAmount: 0.004,
        },
      };

      // Step 1: Pause Campaign
      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'paused' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({ ...mockRun, status: 'paused' });
      gatherQueue.getJobs.mockResolvedValue([]);
      tradeBuyQueue.getJobs.mockResolvedValue([]);
      tradeSellQueue.getJobs.mockResolvedValue([]);

      const pauseResult = await controller.pauseCampaign(mockCampaign.id, mockUser);

      expect(pauseResult).toEqual({ status: 'paused' });
      expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith(mockCampaign.id, mockUser.id, {
        status: 'paused',
      });
      expect(mockGateway.emitRunStatus).toHaveBeenCalledWith(expect.objectContaining({
        status: 'paused',
      }));

      // Step 2: Resume Campaign
      const pausedCampaign = { ...mockCampaign, status: 'paused' };
      const pausedRun = { ...mockRun, status: 'paused' };
      const mockDbJob = { id: 'job-pause-1', queue: 'trade.buy', status: 'queued' };

      mockSupabaseService.getCampaignById.mockResolvedValue(pausedCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...pausedCampaign, status: 'active' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([pausedRun]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({ ...pausedRun, status: 'running' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue(mockWallets);
      mockSupabaseService.getUserSettings.mockResolvedValue(mockSettings);
      mockSupabaseService.createJob.mockResolvedValue(mockDbJob);
      tradeBuyQueue.add.mockResolvedValue({});
      tradeSellQueue.add.mockResolvedValue({});

      const resumeResult = await controller.resumeCampaign(mockCampaign.id, mockUser);

      expect(resumeResult).toEqual({ status: 'resumed' });
      expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith(mockCampaign.id, mockUser.id, {
        status: 'active',
      });
      expect(tradeBuyQueue.add).toHaveBeenCalledTimes(mockWallets.length);
      expect(tradeSellQueue.add).toHaveBeenCalledTimes(mockWallets.length);
      expect(mockGateway.emitRunStatus).toHaveBeenCalledWith(expect.objectContaining({
        status: 'running',
      }));

      // Step 3: Verify campaign is running again
      mockSupabaseService.getCampaignById.mockResolvedValue({ ...pausedCampaign, status: 'active' });
      const finalStatus = await controller.getCampaign(mockCampaign.id, mockUser);
      expect(finalStatus.status).toBe('active');
    });

    it('should throw error when trying to resume a non-paused campaign', async () => {
      const mockCampaign = {
        id: 'campaign-error-1',
        status: 'active',
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);

      await expect(controller.resumeCampaign(mockCampaign.id, mockUser)).rejects.toThrow(
        new HttpException('Campaign must be paused to resume', HttpStatus.BAD_REQUEST)
      );
    });
  });

  describe('E2E Scenario 3: Distribute Funds Workflow', () => {
    it('should successfully distribute funds to multiple wallets', async () => {
      const mockCampaign = {
        id: 'campaign-distribute-1',
        user_id: mockUser.id,
        name: 'Distribution Test',
        status: 'draft',
      };

      const mockRun = {
        id: 'run-distribute-1',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      };

      const mockDbJob = {
        id: 'job-distribute-1',
        queue: 'distribute',
        status: 'queued',
      };

      const distributionNum = 10;

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.createJob.mockResolvedValue(mockDbJob);
      distributeQueue.add.mockResolvedValue({});

      const result = await controller.distribute(mockCampaign.id, mockUser, { num_wallets: distributionNum });

      expect(result).toBeDefined();
      expect(result.status).toBe('queued');
      expect(result.distributionNum).toBe(distributionNum);
      expect(result.run).toBeDefined();
      expect(mockGateway.emitRunStatus).toHaveBeenCalledWith({
        runId: mockRun.id,
        campaignId: mockCampaign.id,
        status: 'running',
        startedAt: mockRun.started_at,
      });
      expect(distributeQueue.add).toHaveBeenCalledWith('distribute-wallets', {
        runId: mockRun.id,
        campaignId: mockCampaign.id,
        distributionNum,
        dbJobId: mockDbJob.id,
      });
    });

    it('should use default wallet count when not specified', async () => {
      const mockCampaign = {
        id: 'campaign-distribute-2',
        user_id: mockUser.id,
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.createCampaignRun.mockResolvedValue({ id: 'run-2', status: 'running', started_at: new Date() });
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-2', queue: 'distribute', status: 'queued' });
      distributeQueue.add.mockResolvedValue({});

      const result = await controller.distribute(mockCampaign.id, mockUser, {});

      expect(result.distributionNum).toBe(5); // Default value from env or 5
    });

    it('should reject distribution with invalid wallet count', async () => {
      const mockCampaign = { id: 'campaign-distribute-3', user_id: mockUser.id };

      // Test upper bound (101 wallets)
      mockSupabaseService.getCampaignById.mockResolvedValueOnce(mockCampaign);
      await expect(
        controller.distribute(mockCampaign.id, mockUser, { num_wallets: 101 })
      ).rejects.toThrow(new HttpException('num_wallets must be between 1 and 100', HttpStatus.BAD_REQUEST));

      // Test negative value
      mockSupabaseService.getCampaignById.mockResolvedValueOnce(mockCampaign);
      await expect(
        controller.distribute(mockCampaign.id, mockUser, { num_wallets: -5 })
      ).rejects.toThrow(new HttpException('num_wallets must be between 1 and 100', HttpStatus.BAD_REQUEST));
    });
  });

  describe('E2E Scenario 4: Sell-Only Mode Workflow', () => {
    it('should successfully execute sell-only mode for all wallets', async () => {
      const mockCampaign = {
        id: 'campaign-sellonly-1',
        user_id: mockUser.id,
        name: 'Sell Only Test',
        status: 'draft',
      };

      const mockRun = {
        id: 'run-sellonly-1',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      };

      const mockWallets = [
        { id: 'wallet-sell-1', address: 'addr-sell-1' },
        { id: 'wallet-sell-2', address: 'addr-sell-2' },
        { id: 'wallet-sell-3', address: 'addr-sell-3' },
      ];

      const mockSettings = {
        sell_config: {
          sellAllByTimes: 3,
        },
      };

      const mockDbJob = {
        id: 'job-sellonly-1',
        queue: 'trade.sell',
        status: 'queued',
      };

      const totalTimes = 5;

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getUserSettings.mockResolvedValue(mockSettings);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.getWalletsByUserId.mockResolvedValue(mockWallets);
      mockSupabaseService.createJob.mockResolvedValue(mockDbJob);
      tradeSellQueue.add.mockResolvedValue({});

      const result = await controller.startSellOnly(mockCampaign.id, mockUser, { total_times: totalTimes });

      expect(result).toBeDefined();
      expect(result.status).toBe('queued');
      expect(result.totalTimes).toBe(totalTimes);
      expect(result.walletsQueued).toBe(mockWallets.length);
      expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith(mockCampaign.id, mockUser.id, {
        status: 'active',
      });
      expect(tradeSellQueue.add).toHaveBeenCalledTimes(mockWallets.length);
      expect(mockGateway.emitRunStatus).toHaveBeenCalledWith({
        runId: mockRun.id,
        campaignId: mockCampaign.id,
        status: 'running',
        startedAt: mockRun.started_at,
      });

      // Verify sell jobs have correct parameters
      for (const wallet of mockWallets) {
        expect(tradeSellQueue.add).toHaveBeenCalledWith('sell-token', expect.objectContaining({
          campaignId: mockCampaign.id,
          walletId: wallet.id,
          mode: 'sell-only',
          totalTimes,
          stepIndex: 1,
        }));
      }
    });

    it('should use settings default when total_times not specified', async () => {
      const mockCampaign = { id: 'campaign-sellonly-2', user_id: mockUser.id };
      const mockSettings = { sell_config: { sellAllByTimes: 2 } };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getUserSettings.mockResolvedValue(mockSettings);
      mockSupabaseService.updateCampaign.mockResolvedValue(mockCampaign);
      mockSupabaseService.createCampaignRun.mockResolvedValue({ id: 'run-2', status: 'running', started_at: new Date() });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([{ id: 'w1' }]);
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-2', queue: 'trade.sell', status: 'queued' });
      tradeSellQueue.add.mockResolvedValue({});

      const result = await controller.startSellOnly(mockCampaign.id, mockUser, {});

      expect(result.totalTimes).toBe(2);
    });

    it('should reject invalid total_times values', async () => {
      const mockCampaign = { id: 'campaign-sellonly-3', user_id: mockUser.id };

      // Test upper bound (25 times)
      mockSupabaseService.getCampaignById.mockResolvedValueOnce(mockCampaign);
      mockSupabaseService.getUserSettings.mockResolvedValueOnce({});
      await expect(
        controller.startSellOnly(mockCampaign.id, mockUser, { total_times: 25 })
      ).rejects.toThrow(new HttpException('total_times must be between 1 and 20', HttpStatus.BAD_REQUEST));

      // Test negative value
      mockSupabaseService.getCampaignById.mockResolvedValueOnce(mockCampaign);
      mockSupabaseService.getUserSettings.mockResolvedValueOnce({});
      await expect(
        controller.startSellOnly(mockCampaign.id, mockUser, { total_times: -1 })
      ).rejects.toThrow(new HttpException('total_times must be between 1 and 20', HttpStatus.BAD_REQUEST));
    });
  });

  describe('E2E Scenario 5: Gather Funds Workflow', () => {
    it('should successfully initiate funds gathering', async () => {
      const mockCampaign = {
        id: 'campaign-gather-1',
        user_id: mockUser.id,
        name: 'Gather Funds Test',
        status: 'active',
      };

      const mockRun = {
        id: 'run-gather-1',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      };

      const mockDbJob = {
        id: 'job-gather-1',
        queue: 'funds.gather',
        status: 'queued',
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.createJob.mockResolvedValue(mockDbJob);
      fundsGatherQueue.add.mockResolvedValue({});

      const result = await controller.gatherFunds(mockCampaign.id, mockUser);

      expect(result).toEqual({ status: 'queued' });
      expect(mockGateway.emitRunStatus).toHaveBeenCalledWith({
        runId: mockRun.id,
        campaignId: mockCampaign.id,
        status: 'running',
        startedAt: mockRun.started_at,
      });
      expect(fundsGatherQueue.add).toHaveBeenCalledWith('gather-funds', {
        campaignId: mockCampaign.id,
        dbJobId: mockDbJob.id,
      });
    });

    it('should throw error when gathering funds for non-existent campaign', async () => {
      mockSupabaseService.getCampaignById.mockResolvedValue(null);

      await expect(controller.gatherFunds('non-existent-id', mockUser)).rejects.toThrow(
        new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
      );
    });
  });

  describe('E2E Scenario 6: Campaign Logs and Runs History', () => {
    it('should retrieve campaign runs history', async () => {
      const mockCampaign = {
        id: 'campaign-history-1',
        user_id: mockUser.id,
        name: 'History Test',
      };

      const mockRuns = [
        {
          id: 'run-1',
          campaign_id: mockCampaign.id,
          status: 'completed',
          started_at: new Date('2024-01-01T10:00:00Z'),
          ended_at: new Date('2024-01-01T11:00:00Z'),
        },
        {
          id: 'run-2',
          campaign_id: mockCampaign.id,
          status: 'stopped',
          started_at: new Date('2024-01-02T10:00:00Z'),
          ended_at: new Date('2024-01-02T10:30:00Z'),
        },
        {
          id: 'run-3',
          campaign_id: mockCampaign.id,
          status: 'running',
          started_at: new Date('2024-01-03T10:00:00Z'),
          ended_at: null,
        },
      ];

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue(mockRuns);

      const result = await controller.getCampaignRuns(mockCampaign.id, mockUser);

      expect(result).toEqual(mockRuns);
      expect(result.length).toBe(3);
      expect(result[0].status).toBe('completed');
      expect(result[2].status).toBe('running');
    });

    it('should retrieve campaign logs with pagination', async () => {
      const mockCampaign = {
        id: 'campaign-logs-1',
        user_id: mockUser.id,
      };

      const mockLogs = Array.from({ length: 50 }, (_, i) => ({
        id: `log-${i}`,
        campaign_id: mockCampaign.id,
        message: `Log message ${i}`,
        level: 'info',
        timestamp: new Date(),
      }));

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getCampaignLogs.mockResolvedValue(mockLogs);

      // Test with custom limit
      const result = await controller.getCampaignLogs(mockCampaign.id, mockUser, '50');

      expect(result).toEqual(mockLogs);
      expect(mockSupabaseService.getCampaignLogs).toHaveBeenCalledWith(mockCampaign.id, 50);
    });
  });

  describe('E2E Scenario 7: Error Handling and Edge Cases', () => {
    it('should handle campaign not found errors across all operations', async () => {
      // getCampaign returns null without throwing, so we check the result
      mockSupabaseService.getCampaignById.mockResolvedValueOnce(null);
      const result = await controller.getCampaign('non-existent', mockUser);
      expect(result).toBeNull();

      // Other operations should throw
      mockSupabaseService.getCampaignById.mockResolvedValueOnce(null);
      await expect(controller.startCampaign('non-existent', mockUser)).rejects.toThrow(
        new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
      );

      mockSupabaseService.getCampaignById.mockResolvedValueOnce(null);
      await expect(controller.pauseCampaign('non-existent', mockUser)).rejects.toThrow(
        new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
      );

      mockSupabaseService.getCampaignById.mockResolvedValueOnce(null);
      await expect(controller.stopCampaign('non-existent', mockUser)).rejects.toThrow(
        new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
      );
    });

    it('should handle token not found when creating campaign', async () => {
      const dto = {
        name: 'Test Campaign',
        token_id: 'invalid-token',
        pool_id: 'pool-1',
        params: {},
      };

      mockSupabaseService.getTokenById.mockResolvedValue(null);

      await expect(controller.createCampaign(dto, mockUser)).rejects.toThrow(
        new HttpException('Token not found', HttpStatus.NOT_FOUND)
      );
    });

    it('should handle queue failures gracefully', async () => {
      const mockCampaign = {
        id: 'campaign-queue-error',
        pool_id: 'pool-1',
        status: 'draft',
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockResolvedValue({ id: 'run-1', status: 'running', started_at: new Date() });
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', queue: 'gather', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});

      // Simulate queue failure
      gatherQueue.add.mockRejectedValue(new Error('Queue connection failed'));

      await expect(controller.startCampaign(mockCampaign.id, mockUser)).rejects.toThrow('Queue connection failed');
    });

    it('should handle empty wallets list when starting campaign', async () => {
      const mockCampaign = {
        id: 'campaign-no-wallets',
        pool_id: 'pool-1',
        status: 'draft',
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockResolvedValue({ id: 'run-1', status: 'running', started_at: new Date() });
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', queue: 'gather', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});
      gatherQueue.add.mockResolvedValue({});

      const result = await controller.startCampaign(mockCampaign.id, mockUser);

      expect(result).toBeDefined();
      expect(tradeBuyQueue.add).not.toHaveBeenCalled();
      expect(tradeSellQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('E2E Scenario 8: Complex Multi-Step Campaign Operation', () => {
    it('should handle a complex workflow: create → start → pause → resume → distribute → sell-only → gather → stop', async () => {
      // This test simulates a realistic user workflow with multiple operations
      const mockCampaign = {
        id: 'campaign-complex-1',
        user_id: mockUser.id,
        name: 'Complex Workflow Test',
        token_id: 'token-1',
        pool_id: 'pool-1',
        params: {},
        status: 'draft',
      };

      const mockToken = { id: 'token-1', mint: 'mint-1', name: 'Token 1' };
      const mockWallets = [{ id: 'w1', address: 'addr1' }];
      const mockSettings = { trading_config: {}, sell_config: {} };
      const mockRun = { id: 'run-1', status: 'running', started_at: new Date() };
      const mockDbJob = { id: 'job-1', queue: 'gather', status: 'queued' };

      // Setup all mocks
      mockSupabaseService.getTokenById.mockResolvedValue(mockToken);
      mockSupabaseService.createCampaign.mockResolvedValue(mockCampaign);
      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockImplementation((id, userId, updates) =>
        Promise.resolve({ ...mockCampaign, ...updates })
      );
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.updateCampaignRun.mockImplementation((id, updates) =>
        Promise.resolve({ ...mockRun, ...updates })
      );
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
      mockSupabaseService.createJob.mockResolvedValue(mockDbJob);
      mockSupabaseService.getWalletsByUserId.mockResolvedValue(mockWallets);
      mockSupabaseService.getUserSettings.mockResolvedValue(mockSettings);
      gatherQueue.add.mockResolvedValue({});
      tradeBuyQueue.add.mockResolvedValue({});
      tradeSellQueue.add.mockResolvedValue({});
      distributeQueue.add.mockResolvedValue({});
      fundsGatherQueue.add.mockResolvedValue({});
      gatherQueue.getJobs.mockResolvedValue([]);
      tradeBuyQueue.getJobs.mockResolvedValue([]);
      tradeSellQueue.getJobs.mockResolvedValue([]);

      // Step 1: Create
      const created = await controller.createCampaign({
        name: mockCampaign.name,
        token_id: mockCampaign.token_id,
        pool_id: mockCampaign.pool_id,
        params: mockCampaign.params,
      }, mockUser);
      expect(created.status).toBe('draft');

      // Step 2: Start
      const started = await controller.startCampaign(mockCampaign.id, mockUser);
      expect(started.run.status).toBe('running');

      // Step 3: Pause
      mockSupabaseService.getCampaignById.mockResolvedValue({ ...mockCampaign, status: 'active' });
      const paused = await controller.pauseCampaign(mockCampaign.id, mockUser);
      expect(paused.status).toBe('paused');

      // Step 4: Resume
      mockSupabaseService.getCampaignById.mockResolvedValue({ ...mockCampaign, status: 'paused' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([{ ...mockRun, status: 'paused' }]);
      const resumed = await controller.resumeCampaign(mockCampaign.id, mockUser);
      expect(resumed.status).toBe('resumed');

      // Step 5: Distribute
      mockSupabaseService.getCampaignById.mockResolvedValue({ ...mockCampaign, status: 'active' });
      const distributed = await controller.distribute(mockCampaign.id, mockUser, { num_wallets: 3 });
      expect(distributed.status).toBe('queued');

      // Step 6: Sell-only
      const sellOnly = await controller.startSellOnly(mockCampaign.id, mockUser, { total_times: 2 });
      expect(sellOnly.status).toBe('queued');

      // Step 7: Gather funds
      const gathered = await controller.gatherFunds(mockCampaign.id, mockUser);
      expect(gathered.status).toBe('queued');

      // Step 8: Stop
      const stopped = await controller.stopCampaign(mockCampaign.id, mockUser);
      expect(stopped.status).toBe('stopped');

      // Verify all queue interactions happened
      expect(gatherQueue.add).toHaveBeenCalled();
      expect(tradeBuyQueue.add).toHaveBeenCalled();
      expect(tradeSellQueue.add).toHaveBeenCalled();
      expect(distributeQueue.add).toHaveBeenCalled();
      expect(fundsGatherQueue.add).toHaveBeenCalled();
      expect(mockGateway.emitRunStatus).toHaveBeenCalled();
    });
  });
});
