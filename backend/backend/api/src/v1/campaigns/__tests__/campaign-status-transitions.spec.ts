import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { CampaignsController } from '../campaigns.controller';
import { SupabaseService } from '../../../services/supabase.service';
import { CampaignWebSocketGateway } from '../../../websocket/websocket.gateway';

/**
 * Test Suite for Campaign Status Transitions
 *
 * Tests campaign lifecycle state machine transitions:
 * - draft → active (via start)
 * - active → paused (via pause)
 * - paused → active (via resume)
 * - active → stopped (via stop)
 * - paused → stopped (via stop)
 *
 * Campaign statuses: 'draft', 'active', 'paused', 'stopped', 'completed'
 * Run statuses: 'running', 'paused', 'stopped', 'completed', 'failed'
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

describe('Campaign Status Transitions', () => {
  let controller: CampaignsController;
  let supabaseService: SupabaseService;
  let gateway: CampaignWebSocketGateway;
  let gatherQueue: any;
  let tradeBuyQueue: any;
  let tradeSellQueue: any;

  const mockUser = { id: 'test-user-transitions' };

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

    controller = new CampaignsController(
      mockSupabaseService as any,
      mockGateway as any,
    );

    (controller as any).gatherQueue = gatherQueue;
    (controller as any).tradeBuyQueue = tradeBuyQueue;
    (controller as any).tradeSellQueue = tradeSellQueue;

    supabaseService = mockSupabaseService as any;
    gateway = mockGateway as any;

    vi.clearAllMocks();
  });

  describe('Valid Status Transitions', () => {
    describe('draft → active (start campaign)', () => {
      it('should transition campaign from draft to active when started', async () => {
        const mockCampaign = {
          id: 'campaign-1',
          user_id: mockUser.id,
          name: 'Test Campaign',
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
        mockSupabaseService.updateCampaign.mockImplementation((id, userId, updates) =>
          Promise.resolve({ ...mockCampaign, ...updates })
        );
        mockSupabaseService.createCampaignRun.mockResolvedValue(mockRun);
        mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
        mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
        mockSupabaseService.getUserSettings.mockResolvedValue({});
        gatherQueue.add.mockResolvedValue({});

        const result = await controller.startCampaign(mockCampaign.id, mockUser);

        expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith(
          mockCampaign.id,
          mockUser.id,
          { status: 'active' }
        );
        expect(result.campaign).toBeDefined();
        expect(result.run.status).toBe('running');
        expect(mockGateway.emitRunStatus).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'running' })
        );
      });

      it('should create a new run when starting campaign', async () => {
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
    });

    describe('active → paused (pause campaign)', () => {
      it('should transition campaign from active to paused', async () => {
        const mockCampaign = {
          id: 'campaign-3',
          status: 'active',
        };

        const mockRun = {
          id: 'run-3',
          campaign_id: mockCampaign.id,
          status: 'running',
          started_at: new Date(),
        };

        mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
        mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'paused' });
        mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
        mockSupabaseService.updateCampaignRun.mockResolvedValue({ ...mockRun, status: 'paused' });

        const result = await controller.pauseCampaign(mockCampaign.id, mockUser);

        expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith(
          mockCampaign.id,
          mockUser.id,
          { status: 'paused' }
        );
        expect(result.status).toBe('paused');
        expect(mockSupabaseService.updateCampaignRun).toHaveBeenCalledWith(mockRun.id, {
          status: 'paused',
        });
      });

      it('should update run status to paused when pausing campaign', async () => {
        const mockCampaign = {
          id: 'campaign-4',
          status: 'active',
        };

        const mockRun = {
          id: 'run-4',
          status: 'running',
          started_at: new Date(),
        };

        mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
        mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'paused' });
        mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
        mockSupabaseService.updateCampaignRun.mockResolvedValue({ ...mockRun, status: 'paused' });

        await controller.pauseCampaign(mockCampaign.id, mockUser);

        expect(mockGateway.emitRunStatus).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'paused' })
        );
      });

      it('should remove pending jobs when pausing campaign', async () => {
        const mockCampaign = {
          id: 'campaign-5',
          status: 'active',
        };

        const mockJob = {
          data: { campaignId: mockCampaign.id },
          remove: vi.fn(),
        };

        mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
        mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'paused' });
        mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([
          { id: 'run-5', status: 'running', started_at: new Date() },
        ]);
        mockSupabaseService.updateCampaignRun.mockResolvedValue({ id: 'run-5', status: 'paused' });
        gatherQueue.getJobs.mockResolvedValue([mockJob]);
        tradeBuyQueue.getJobs.mockResolvedValue([mockJob]);
        tradeSellQueue.getJobs.mockResolvedValue([mockJob]);

        await controller.pauseCampaign(mockCampaign.id, mockUser);

        expect(mockJob.remove).toHaveBeenCalledTimes(3); // Once per queue
      });
    });

    describe('paused → active (resume campaign)', () => {
      it('should transition campaign from paused to active when resumed', async () => {
        const mockCampaign = {
          id: 'campaign-6',
          status: 'paused',
        };

        const mockRun = {
          id: 'run-6',
          campaign_id: mockCampaign.id,
          status: 'paused',
          started_at: new Date(),
        };

        mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
        mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
        mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
        mockSupabaseService.updateCampaignRun.mockResolvedValue({ ...mockRun, status: 'running' });
        mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
        mockSupabaseService.getUserSettings.mockResolvedValue({});

        const result = await controller.resumeCampaign(mockCampaign.id, mockUser);

        expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith(
          mockCampaign.id,
          mockUser.id,
          { status: 'active' }
        );
        expect(result.status).toBe('resumed');
      });

      it('should update run status to running when resuming campaign', async () => {
        const mockCampaign = {
          id: 'campaign-7',
          status: 'paused',
        };

        const mockRun = {
          id: 'run-7',
          status: 'paused',
          started_at: new Date(),
        };

        mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
        mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
        mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
        mockSupabaseService.updateCampaignRun.mockResolvedValue({ ...mockRun, status: 'running' });
        mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
        mockSupabaseService.getUserSettings.mockResolvedValue({});

        await controller.resumeCampaign(mockCampaign.id, mockUser);

        expect(mockSupabaseService.updateCampaignRun).toHaveBeenCalledWith(mockRun.id, {
          status: 'running',
        });
        expect(mockGateway.emitRunStatus).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'running' })
        );
      });

      it('should re-enqueue jobs when resuming campaign', async () => {
        const mockCampaign = {
          id: 'campaign-8',
          status: 'paused',
        };

        const mockWallets = [
          { id: 'wallet-1', address: 'addr-1' },
          { id: 'wallet-2', address: 'addr-2' },
        ];

        mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
        mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
        mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([
          { id: 'run-8', status: 'paused', started_at: new Date() },
        ]);
        mockSupabaseService.updateCampaignRun.mockResolvedValue({ id: 'run-8', status: 'running' });
        mockSupabaseService.getWalletsByUserId.mockResolvedValue(mockWallets);
        mockSupabaseService.getUserSettings.mockResolvedValue({});
        mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
        tradeBuyQueue.add.mockResolvedValue({});
        tradeSellQueue.add.mockResolvedValue({});

        await controller.resumeCampaign(mockCampaign.id, mockUser);

        expect(tradeBuyQueue.add).toHaveBeenCalledTimes(mockWallets.length);
        expect(tradeSellQueue.add).toHaveBeenCalledTimes(mockWallets.length);
      });
    });

    describe('active → stopped (stop campaign)', () => {
      it('should transition campaign from active to stopped', async () => {
        const mockCampaign = {
          id: 'campaign-9',
          status: 'active',
        };

        const mockRun = {
          id: 'run-9',
          status: 'running',
          started_at: new Date(),
        };

        mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
        mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'stopped' });
        mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
        mockSupabaseService.updateCampaignRun.mockResolvedValue({
          ...mockRun,
          status: 'stopped',
          ended_at: new Date(),
        });

        const result = await controller.stopCampaign(mockCampaign.id, mockUser);

        expect(mockSupabaseService.updateCampaign).toHaveBeenCalledWith(
          mockCampaign.id,
          mockUser.id,
          { status: 'stopped' }
        );
        expect(result.status).toBe('stopped');
      });

      it('should update run status to stopped with ended_at timestamp', async () => {
        const mockCampaign = {
          id: 'campaign-10',
          status: 'active',
        };

        const mockRun = {
          id: 'run-10',
          status: 'running',
          started_at: new Date(),
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

      it('should remove all pending and delayed jobs when stopping campaign', async () => {
        const mockCampaign = {
          id: 'campaign-11',
          status: 'active',
        };

        const mockJob = {
          data: { campaignId: mockCampaign.id },
          remove: vi.fn(),
        };

        mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
        mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'stopped' });
        mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([
          { id: 'run-11', status: 'running', started_at: new Date() },
        ]);
        mockSupabaseService.updateCampaignRun.mockResolvedValue({
          id: 'run-11',
          status: 'stopped',
          ended_at: new Date(),
        });
        gatherQueue.getJobs.mockResolvedValue([mockJob]);
        tradeBuyQueue.getJobs.mockResolvedValue([mockJob]);
        tradeSellQueue.getJobs.mockResolvedValue([mockJob]);

        await controller.stopCampaign(mockCampaign.id, mockUser);

        expect(gatherQueue.getJobs).toHaveBeenCalledWith(['waiting', 'active', 'delayed']);
        expect(tradeBuyQueue.getJobs).toHaveBeenCalledWith(['waiting', 'active', 'delayed']);
        expect(tradeSellQueue.getJobs).toHaveBeenCalledWith(['waiting', 'active', 'delayed']);
        expect(mockJob.remove).toHaveBeenCalledTimes(3);
      });
    });

    describe('paused → stopped (stop paused campaign)', () => {
      it('should transition campaign from paused to stopped', async () => {
        const mockCampaign = {
          id: 'campaign-12',
          status: 'paused',
        };

        const mockRun = {
          id: 'run-12',
          status: 'paused',
          started_at: new Date(),
        };

        mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
        mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'stopped' });
        mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([mockRun]);
        mockSupabaseService.updateCampaignRun.mockResolvedValue({
          ...mockRun,
          status: 'stopped',
          ended_at: new Date(),
        });

        const result = await controller.stopCampaign(mockCampaign.id, mockUser);

        expect(result.status).toBe('stopped');
        expect(mockSupabaseService.updateCampaignRun).toHaveBeenCalledWith(mockRun.id, {
          status: 'stopped',
          ended_at: expect.any(Date),
        });
      });
    });
  });

  describe('Invalid Status Transitions', () => {
    it('should reject resume when campaign is not paused', async () => {
      const mockCampaign = {
        id: 'campaign-invalid-1',
        status: 'active',
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);

      await expect(controller.resumeCampaign(mockCampaign.id, mockUser)).rejects.toThrow(
        new HttpException('Campaign must be paused to resume', HttpStatus.BAD_REQUEST)
      );
    });

    it('should reject resume when campaign is in draft status', async () => {
      const mockCampaign = {
        id: 'campaign-invalid-2',
        status: 'draft',
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);

      await expect(controller.resumeCampaign(mockCampaign.id, mockUser)).rejects.toThrow(
        new HttpException('Campaign must be paused to resume', HttpStatus.BAD_REQUEST)
      );
    });

    it('should reject resume when campaign is stopped', async () => {
      const mockCampaign = {
        id: 'campaign-invalid-3',
        status: 'stopped',
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);

      await expect(controller.resumeCampaign(mockCampaign.id, mockUser)).rejects.toThrow(
        new HttpException('Campaign must be paused to resume', HttpStatus.BAD_REQUEST)
      );
    });

    it('should reject operations on non-existent campaigns', async () => {
      mockSupabaseService.getCampaignById.mockResolvedValue(null);

      await expect(controller.startCampaign('non-existent', mockUser)).rejects.toThrow(
        new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
      );

      await expect(controller.pauseCampaign('non-existent', mockUser)).rejects.toThrow(
        new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
      );

      await expect(controller.resumeCampaign('non-existent', mockUser)).rejects.toThrow(
        new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
      );

      await expect(controller.stopCampaign('non-existent', mockUser)).rejects.toThrow(
        new HttpException('Campaign not found', HttpStatus.NOT_FOUND)
      );
    });
  });

  describe('State Machine Integrity', () => {
    it('should maintain consistent campaign and run statuses during transitions', async () => {
      const campaignId = 'campaign-consistency';
      let currentCampaignStatus = 'draft';
      let currentRunStatus = null as string | null;

      // Mock that tracks status changes
      mockSupabaseService.updateCampaign.mockImplementation((id, userId, updates) => {
        if (updates.status) currentCampaignStatus = updates.status;
        return Promise.resolve({ id, status: updates.status });
      });

      mockSupabaseService.updateCampaignRun.mockImplementation((id, updates) => {
        if (updates.status) currentRunStatus = updates.status;
        return Promise.resolve({ id, status: updates.status, ...updates });
      });

      // Start: draft → active, create run with status running
      mockSupabaseService.getCampaignById.mockResolvedValue({ id: campaignId, pool_id: 'pool-1', status: currentCampaignStatus });
      mockSupabaseService.createCampaignRun.mockResolvedValue({ id: 'run-1', status: 'running', started_at: new Date() });
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});
      gatherQueue.add.mockResolvedValue({});

      await controller.startCampaign(campaignId, mockUser);
      expect(currentCampaignStatus).toBe('active');

      // Pause: active → paused, run running → paused
      mockSupabaseService.getCampaignById.mockResolvedValue({ id: campaignId, status: currentCampaignStatus });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([{ id: 'run-1', status: 'running', started_at: new Date() }]);

      await controller.pauseCampaign(campaignId, mockUser);
      expect(currentCampaignStatus).toBe('paused');
      expect(currentRunStatus).toBe('paused');

      // Resume: paused → active, run paused → running
      mockSupabaseService.getCampaignById.mockResolvedValue({ id: campaignId, status: currentCampaignStatus });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([{ id: 'run-1', status: 'paused', started_at: new Date() }]);
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});

      await controller.resumeCampaign(campaignId, mockUser);
      expect(currentCampaignStatus).toBe('active');
      expect(currentRunStatus).toBe('running');

      // Stop: active → stopped, run running → stopped
      mockSupabaseService.getCampaignById.mockResolvedValue({ id: campaignId, status: currentCampaignStatus });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([{ id: 'run-1', status: 'running', started_at: new Date() }]);

      await controller.stopCampaign(campaignId, mockUser);
      expect(currentCampaignStatus).toBe('stopped');
      expect(currentRunStatus).toBe('stopped');
    });

    it('should emit WebSocket events for all status changes', async () => {
      const mockCampaign = {
        id: 'campaign-ws-test',
        pool_id: 'pool-1',
        status: 'draft',
      };

      // Start
      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockResolvedValue({ id: 'run-ws', status: 'running', started_at: new Date() });
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-ws', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});
      gatherQueue.add.mockResolvedValue({});

      await controller.startCampaign(mockCampaign.id, mockUser);
      expect(mockGateway.emitRunStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running' })
      );

      vi.clearAllMocks();

      // Pause
      mockSupabaseService.getCampaignById.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'paused' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([{ id: 'run-ws', status: 'running', started_at: new Date() }]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({ id: 'run-ws', status: 'paused' });

      await controller.pauseCampaign(mockCampaign.id, mockUser);
      expect(mockGateway.emitRunStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paused' })
      );

      vi.clearAllMocks();

      // Resume
      mockSupabaseService.getCampaignById.mockResolvedValue({ ...mockCampaign, status: 'paused' });
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([{ id: 'run-ws', status: 'paused', started_at: new Date() }]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({ id: 'run-ws', status: 'running' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});

      await controller.resumeCampaign(mockCampaign.id, mockUser);
      expect(mockGateway.emitRunStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running' })
      );

      vi.clearAllMocks();

      // Stop
      mockSupabaseService.getCampaignById.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'stopped' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([{ id: 'run-ws', status: 'running', started_at: new Date() }]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({ id: 'run-ws', status: 'stopped', ended_at: new Date() });

      await controller.stopCampaign(mockCampaign.id, mockUser);
      expect(mockGateway.emitRunStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'stopped', endedAt: expect.any(Date) })
      );
    });

    it('should handle multiple runs and only update the active one', async () => {
      const mockCampaign = {
        id: 'campaign-multi-run',
        status: 'active',
      };

      const mockRuns = [
        { id: 'run-1', status: 'completed', started_at: new Date('2024-01-01'), ended_at: new Date('2024-01-02') },
        { id: 'run-2', status: 'stopped', started_at: new Date('2024-01-03'), ended_at: new Date('2024-01-04') },
        { id: 'run-3', status: 'running', started_at: new Date('2024-01-05') },
      ];

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'paused' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue(mockRuns);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({ ...mockRuns[2], status: 'paused' });

      await controller.pauseCampaign(mockCampaign.id, mockUser);

      // Should only update the active run (run-3)
      expect(mockSupabaseService.updateCampaignRun).toHaveBeenCalledWith('run-3', {
        status: 'paused',
      });
      expect(mockSupabaseService.updateCampaignRun).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle campaigns with no active runs gracefully', async () => {
      const mockCampaign = {
        id: 'campaign-no-runs',
        status: 'active',
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'paused' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([]);

      const result = await controller.pauseCampaign(mockCampaign.id, mockUser);

      expect(result.status).toBe('paused');
      expect(mockSupabaseService.updateCampaignRun).not.toHaveBeenCalled();
    });

    it('should handle campaigns with only completed/stopped runs', async () => {
      const mockCampaign = {
        id: 'campaign-old-runs',
        status: 'active',
      };

      const mockRuns = [
        { id: 'run-1', status: 'completed', started_at: new Date(), ended_at: new Date() },
        { id: 'run-2', status: 'stopped', started_at: new Date(), ended_at: new Date() },
      ];

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'stopped' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue(mockRuns);

      const result = await controller.stopCampaign(mockCampaign.id, mockUser);

      expect(result.status).toBe('stopped');
      // No active run to update
      expect(mockSupabaseService.updateCampaignRun).not.toHaveBeenCalled();
    });

    it('should handle resume with empty wallet list', async () => {
      const mockCampaign = {
        id: 'campaign-no-wallets',
        status: 'paused',
      };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([
        { id: 'run-1', status: 'paused', started_at: new Date() },
      ]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({ id: 'run-1', status: 'running' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});

      const result = await controller.resumeCampaign(mockCampaign.id, mockUser);

      expect(result.status).toBe('resumed');
      expect(tradeBuyQueue.add).not.toHaveBeenCalled();
      expect(tradeSellQueue.add).not.toHaveBeenCalled();
    });
  });
});
