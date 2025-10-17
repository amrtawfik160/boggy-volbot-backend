import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { CampaignsController } from '../campaigns.controller';
import { SupabaseService } from '../../../services/supabase.service';
import { CampaignWebSocketGateway } from '../../../websocket/websocket.gateway';

/**
 * Test Suite for Campaign Run Creation and Association
 *
 * Tests campaign run creation and management:
 * - Run creation when starting campaigns
 * - Run creation for distribute, sell-only, gather operations
 * - Correct association between runs and campaigns
 * - Multiple runs per campaign handling
 * - Run metadata (timestamps, status, summary)
 * - Run retrieval and filtering
 */

// Mock BullMQ Queue
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    getJobs: vi.fn().mockResolvedValue([]),
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

describe('Campaign Run Creation and Association', () => {
  let controller: CampaignsController;
  let supabaseService: SupabaseService;
  let gateway: CampaignWebSocketGateway;
  let gatherQueue: any;
  let tradeBuyQueue: any;
  let tradeSellQueue: any;
  let distributeQueue: any;
  let fundsGatherQueue: any;

  const mockUser = { id: 'test-user-runs' };

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
    gatherQueue = {
      add: vi.fn(),
      getJobs: vi.fn().mockResolvedValue([]),
      getWaitingCount: vi.fn(),
      getActiveCount: vi.fn(),
    };

    tradeBuyQueue = {
      add: vi.fn(),
      getJobs: vi.fn().mockResolvedValue([]),
      getWaitingCount: vi.fn(),
      getActiveCount: vi.fn(),
    };

    tradeSellQueue = {
      add: vi.fn(),
      getJobs: vi.fn().mockResolvedValue([]),
      getWaitingCount: vi.fn(),
      getActiveCount: vi.fn(),
    };

    distributeQueue = {
      add: vi.fn(),
      getJobs: vi.fn().mockResolvedValue([]),
      getWaitingCount: vi.fn(),
      getActiveCount: vi.fn(),
    };

    fundsGatherQueue = {
      add: vi.fn(),
      getJobs: vi.fn().mockResolvedValue([]),
      getWaitingCount: vi.fn(),
      getActiveCount: vi.fn(),
    };

    controller = new CampaignsController(
      mockSupabaseService as any,
      mockGateway as any,
    );

    (controller as any).gatherQueue = gatherQueue;
    (controller as any).tradeBuyQueue = tradeBuyQueue;
    (controller as any).tradeSellQueue = tradeSellQueue;
    (controller as any).distributeQueue = distributeQueue;
    (controller as any).fundsGatherQueue = fundsGatherQueue;

    supabaseService = mockSupabaseService as any;
    gateway = mockGateway as any;

    vi.clearAllMocks();
  });

  describe('Run Creation on Campaign Start', () => {
    it('should create a new run when starting a campaign', async () => {
      const mockCampaign = {
        id: 'campaign-1',
        pool_id: 'pool-1',
        status: 'draft',
      };

      const mockRun = {
        id: 'run-1',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});
      gatherQueue.add.mockResolvedValue({});

      const result = await controller.startCampaign(mockCampaign.id, mockUser);

      expect(mockSupabaseService.createCampaignRun).toHaveBeenCalledWith({
        campaign_id: mockCampaign.id,
        status: 'running',
      });
      expect(result.run).toBeDefined();
      expect(result.run.id).toBe(mockRun.id);
      expect(result.run.campaign_id).toBe(mockCampaign.id);
    });

    it('should create run with correct initial status (running)', async () => {
      const mockCampaign = {
        id: 'campaign-2',
        pool_id: 'pool-1',
        status: 'draft',
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockResolvedValue({
        id: 'run-2',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      });
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-2', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});
      gatherQueue.add.mockResolvedValue({});

      await controller.startCampaign(mockCampaign.id, mockUser);

      expect(mockSupabaseService.createCampaignRun).toHaveBeenCalledWith({
        campaign_id: mockCampaign.id,
        status: 'running',
      });
    });

    it('should set started_at timestamp when creating run', async () => {
      const beforeStart = new Date();
      const mockCampaign = {
        id: 'campaign-3',
        pool_id: 'pool-1',
        status: 'draft',
      };

      const mockRun = {
        id: 'run-3',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-3', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});
      gatherQueue.add.mockResolvedValue({});

      const result = await controller.startCampaign(mockCampaign.id, mockUser);
      const afterStart = new Date();

      expect(result.run.started_at).toBeDefined();
      expect(result.run.started_at.getTime()).toBeGreaterThanOrEqual(beforeStart.getTime());
      expect(result.run.started_at.getTime()).toBeLessThanOrEqual(afterStart.getTime());
    });

    it('should associate run with correct campaign ID', async () => {
      const mockCampaign = {
        id: 'campaign-specific-123',
        pool_id: 'pool-1',
        status: 'draft',
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockResolvedValue({
        id: 'run-4',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      });
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-4', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});
      gatherQueue.add.mockResolvedValue({});

      const result = await controller.startCampaign(mockCampaign.id, mockUser);

      expect(result.run.campaign_id).toBe('campaign-specific-123');
    });
  });

  describe('Run Creation for Different Operations', () => {
    it('should create a run when distributing funds', async () => {
      const mockCampaign = {
        id: 'campaign-distribute',
        user_id: mockUser.id,
        status: 'draft',
      };

      const mockRun = {
        id: 'run-distribute',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-dist', status: 'queued' });
      distributeQueue.add.mockResolvedValue({});

      const result = await controller.distribute(mockCampaign.id, mockUser, { num_wallets: 5 });

      expect(mockSupabaseService.createCampaignRun).toHaveBeenCalledWith({
        campaign_id: mockCampaign.id,
        status: 'running',
      });
      expect(result.run).toBeDefined();
      expect(result.run.id).toBe(mockRun.id);
    });

    it('should create a run when starting sell-only mode', async () => {
      const mockCampaign = {
        id: 'campaign-sellonly',
        user_id: mockUser.id,
        status: 'draft',
      };

      const mockRun = {
        id: 'run-sellonly',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getUserSettings.mockResolvedValue({});
      mockSupabaseService.updateCampaign.mockResolvedValue(mockCampaign);
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-sell', status: 'queued' });

      const result = await controller.startSellOnly(mockCampaign.id, mockUser, {});

      expect(mockSupabaseService.createCampaignRun).toHaveBeenCalledWith({
        campaign_id: mockCampaign.id,
        status: 'running',
      });
      expect(result.run).toBeDefined();
    });

    it('should create a run when gathering funds', async () => {
      const mockCampaign = {
        id: 'campaign-gather',
        user_id: mockUser.id,
        status: 'draft',
      };

      const mockRun = {
        id: 'run-gather',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-gather', status: 'queued' });
      fundsGatherQueue.add.mockResolvedValue({});

      const result = await controller.gatherFunds(mockCampaign.id, mockUser);

      expect(mockSupabaseService.createCampaignRun).toHaveBeenCalledWith({
        campaign_id: mockCampaign.id,
        status: 'running',
      });
    });
  });

  describe('Multiple Runs Per Campaign', () => {
    it('should support creating multiple runs for the same campaign', async () => {
      const mockCampaign = {
        id: 'campaign-multi',
        pool_id: 'pool-1',
        status: 'draft',
      };

      // First run
      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockResolvedValueOnce({
        id: 'run-1',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      });
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});
      gatherQueue.add.mockResolvedValue({});

      const result1 = await controller.startCampaign(mockCampaign.id, mockUser);

      // Second run (after stopping first)
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockResolvedValueOnce({
        id: 'run-2',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      });

      const result2 = await controller.startCampaign(mockCampaign.id, mockUser);

      expect(result1.run.id).toBe('run-1');
      expect(result2.run.id).toBe('run-2');
      expect(mockSupabaseService.createCampaignRun).toHaveBeenCalledTimes(2);
    });

    it('should retrieve all runs for a campaign', async () => {
      const mockCampaign = {
        id: 'campaign-history',
        user_id: mockUser.id,
      };

      const mockRuns = [
        {
          id: 'run-1',
          campaign_id: mockCampaign.id,
          status: 'completed',
          started_at: new Date('2024-01-01'),
          ended_at: new Date('2024-01-02'),
        },
        {
          id: 'run-2',
          campaign_id: mockCampaign.id,
          status: 'stopped',
          started_at: new Date('2024-01-03'),
          ended_at: new Date('2024-01-04'),
        },
        {
          id: 'run-3',
          campaign_id: mockCampaign.id,
          status: 'running',
          started_at: new Date('2024-01-05'),
        },
      ];

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue(mockRuns);

      const result = await controller.getCampaignRuns(mockCampaign.id, mockUser);

      expect(result).toEqual(mockRuns);
      expect(result.length).toBe(3);
      expect(mockSupabaseService.getCampaignRunsByCampaignId).toHaveBeenCalledWith(mockCampaign.id);
    });

    it('should handle campaigns with no runs', async () => {
      const mockCampaign = {
        id: 'campaign-no-runs',
        user_id: mockUser.id,
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([]);

      const result = await controller.getCampaignRuns(mockCampaign.id, mockUser);

      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });

    it('should only return runs for the specified campaign', async () => {
      const mockCampaign = {
        id: 'campaign-specific',
        user_id: mockUser.id,
      };

      const mockRuns = [
        {
          id: 'run-1',
          campaign_id: 'campaign-specific',
          status: 'running',
          started_at: new Date(),
        },
      ];

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue(mockRuns);

      const result = await controller.getCampaignRuns(mockCampaign.id, mockUser);

      expect(result.every(run => run.campaign_id === 'campaign-specific')).toBe(true);
    });
  });

  describe('Run Metadata and Timestamps', () => {
    it('should set ended_at timestamp when stopping a run', async () => {
      const mockCampaign = {
        id: 'campaign-stop',
        status: 'active',
      };

      const mockRun = {
        id: 'run-stop',
        status: 'running',
        started_at: new Date('2024-01-01'),
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'stopped' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({
        ...mockRun,
        status: 'stopped',
        ended_at: new Date(),
      });

      await controller.stopCampaign(mockCampaign.id, mockUser);

      expect(mockSupabaseService.updateCampaignRun).toHaveBeenCalledWith(mockRun.id, {
        status: 'stopped',
        ended_at: expect.any(Date),
      });
    });

    it('should preserve started_at when updating run status', async () => {
      const originalStartTime = new Date('2024-01-01T10:00:00Z');
      const mockCampaign = {
        id: 'campaign-preserve',
        status: 'active',
      };

      const mockRun = {
        id: 'run-preserve',
        status: 'running',
        started_at: originalStartTime,
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'paused' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({
        ...mockRun,
        status: 'paused',
      });

      await controller.pauseCampaign(mockCampaign.id, mockUser);

      // Should only update status, not started_at
      expect(mockSupabaseService.updateCampaignRun).toHaveBeenCalledWith(mockRun.id, {
        status: 'paused',
      });
    });

    it('should handle run status changes correctly', async () => {
      const mockCampaign = {
        id: 'campaign-status-change',
        status: 'active',
      };

      const mockRun = {
        id: 'run-status-change',
        status: 'running',
        started_at: new Date(),
      };

      // Pause
      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'paused' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({ ...mockRun, status: 'paused' });

      await controller.pauseCampaign(mockCampaign.id, mockUser);

      expect(mockSupabaseService.updateCampaignRun).toHaveBeenCalledWith(mockRun.id, {
        status: 'paused',
      });

      // Resume
      mockSupabaseService.getCampaignById.mockResolvedValue({ ...mockCampaign, status: 'paused' });
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([{ ...mockRun, status: 'paused' }]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({ ...mockRun, status: 'running' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});

      await controller.resumeCampaign(mockCampaign.id, mockUser);

      expect(mockSupabaseService.updateCampaignRun).toHaveBeenCalledWith(mockRun.id, {
        status: 'running',
      });
    });
  });

  describe('Run and Campaign Status Synchronization', () => {
    it('should retrieve latest run with campaign status', async () => {
      const mockCampaign = {
        id: 'campaign-status',
        status: 'active',
      };

      const mockRuns = [
        {
          id: 'run-latest',
          campaign_id: mockCampaign.id,
          status: 'running',
          started_at: new Date(),
        },
      ];

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue(mockRuns);
      gatherQueue.getWaitingCount.mockResolvedValue(0);
      gatherQueue.getActiveCount.mockResolvedValue(0);
      tradeBuyQueue.getWaitingCount.mockResolvedValue(0);
      tradeBuyQueue.getActiveCount.mockResolvedValue(0);
      tradeSellQueue.getWaitingCount.mockResolvedValue(0);
      tradeSellQueue.getActiveCount.mockResolvedValue(0);

      const result = await controller.getCampaignStatus(mockCampaign.id, mockUser);

      expect(result.campaign.status).toBe('active');
      expect(result.latestRun.status).toBe('running');
    });

    it('should emit WebSocket events with run information', async () => {
      const mockCampaign = {
        id: 'campaign-ws',
        pool_id: 'pool-1',
        status: 'draft',
      };

      const mockRun = {
        id: 'run-ws',
        campaign_id: mockCampaign.id,
        status: 'running',
        started_at: new Date(),
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-ws', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});
      gatherQueue.add.mockResolvedValue({});

      await controller.startCampaign(mockCampaign.id, mockUser);

      expect(mockGateway.emitRunStatus).toHaveBeenCalledWith({
        runId: mockRun.id,
        campaignId: mockCampaign.id,
        status: 'running',
        startedAt: mockRun.started_at,
      });
    });
  });

  describe('Error Handling', () => {
    it('should fail to get runs for non-existent campaign', async () => {
      mockSupabaseService.getCampaignById.mockResolvedValue(null);

      await expect(controller.getCampaignRuns('non-existent', mockUser)).rejects.toThrow(
        new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
      );
    });

    it('should verify campaign ownership before retrieving runs', async () => {
      const mockCampaign = {
        id: 'campaign-other-user',
        user_id: 'other-user-id',
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(null);

      await expect(controller.getCampaignRuns(mockCampaign.id, mockUser)).rejects.toThrow(
        new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
      );
    });

    it('should handle database errors gracefully when creating runs', async () => {
      const mockCampaign = {
        id: 'campaign-error',
        pool_id: 'pool-1',
        status: 'draft',
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockRejectedValue(new Error('Database error'));

      await expect(controller.startCampaign(mockCampaign.id, mockUser)).rejects.toThrow('Database error');
    });
  });

  describe('Run Ordering and History', () => {
    it('should return runs in the order provided by database', async () => {
      const mockCampaign = {
        id: 'campaign-order',
        user_id: mockUser.id,
      };

      const mockRuns = [
        {
          id: 'run-3',
          campaign_id: mockCampaign.id,
          status: 'running',
          started_at: new Date('2024-01-05'),
        },
        {
          id: 'run-2',
          campaign_id: mockCampaign.id,
          status: 'stopped',
          started_at: new Date('2024-01-03'),
          ended_at: new Date('2024-01-04'),
        },
        {
          id: 'run-1',
          campaign_id: mockCampaign.id,
          status: 'completed',
          started_at: new Date('2024-01-01'),
          ended_at: new Date('2024-01-02'),
        },
      ];

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue(mockRuns);

      const result = await controller.getCampaignRuns(mockCampaign.id, mockUser);

      expect(result[0].id).toBe('run-3');
      expect(result[1].id).toBe('run-2');
      expect(result[2].id).toBe('run-1');
    });

    it('should include all run statuses in history', async () => {
      const mockCampaign = {
        id: 'campaign-all-statuses',
        user_id: mockUser.id,
      };

      const mockRuns = [
        { id: 'run-1', status: 'running', started_at: new Date() },
        { id: 'run-2', status: 'paused', started_at: new Date() },
        { id: 'run-3', status: 'stopped', started_at: new Date(), ended_at: new Date() },
        { id: 'run-4', status: 'completed', started_at: new Date(), ended_at: new Date() },
        { id: 'run-5', status: 'failed', started_at: new Date(), ended_at: new Date() },
      ];

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue(mockRuns);

      const result = await controller.getCampaignRuns(mockCampaign.id, mockUser);

      const statuses = result.map(r => r.status);
      expect(statuses).toContain('running');
      expect(statuses).toContain('paused');
      expect(statuses).toContain('stopped');
      expect(statuses).toContain('completed');
      expect(statuses).toContain('failed');
    });
  });
});
