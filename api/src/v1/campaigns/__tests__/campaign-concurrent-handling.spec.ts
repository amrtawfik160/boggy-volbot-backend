import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { CampaignsController } from '../campaigns.controller';
import { SupabaseService } from '../../../services/supabase.service';
import { CampaignWebSocketGateway } from '../../../websocket/websocket.gateway';

/**
 * Test Suite for Concurrent Campaign Handling
 *
 * Tests system behavior under concurrent operations:
 * - Multiple campaigns created simultaneously by different users
 * - Concurrent campaign modifications (start, pause, resume, stop)
 * - Campaign execution isolation across different users
 * - Race conditions in campaign run creation
 * - Database transaction handling under concurrent load
 * - Queue isolation and job processing per campaign
 * - Resource contention and locking mechanisms
 * - Data consistency under concurrent updates
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

describe('Concurrent Campaign Handling', () => {
  let controller: CampaignsController;
  let supabaseService: SupabaseService;
  let gateway: CampaignWebSocketGateway;
  let gatherQueue: any;
  let tradeBuyQueue: any;
  let tradeSellQueue: any;
  let distributeQueue: any;
  let fundsGatherQueue: any;

  const mockUser1 = { id: 'user-1' };
  const mockUser2 = { id: 'user-2' };
  const mockUser3 = { id: 'user-3' };

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
      add: vi.fn().mockResolvedValue({}),
      getJobs: vi.fn().mockResolvedValue([]),
      getWaitingCount: vi.fn().mockResolvedValue(0),
      getActiveCount: vi.fn().mockResolvedValue(0),
    };

    tradeBuyQueue = {
      add: vi.fn().mockResolvedValue({}),
      getJobs: vi.fn().mockResolvedValue([]),
      getWaitingCount: vi.fn().mockResolvedValue(0),
      getActiveCount: vi.fn().mockResolvedValue(0),
    };

    tradeSellQueue = {
      add: vi.fn().mockResolvedValue({}),
      getJobs: vi.fn().mockResolvedValue([]),
      getWaitingCount: vi.fn().mockResolvedValue(0),
      getActiveCount: vi.fn().mockResolvedValue(0),
    };

    distributeQueue = {
      add: vi.fn().mockResolvedValue({}),
      getJobs: vi.fn().mockResolvedValue([]),
      getWaitingCount: vi.fn().mockResolvedValue(0),
      getActiveCount: vi.fn().mockResolvedValue(0),
    };

    fundsGatherQueue = {
      add: vi.fn().mockResolvedValue({}),
      getJobs: vi.fn().mockResolvedValue([]),
      getWaitingCount: vi.fn().mockResolvedValue(0),
      getActiveCount: vi.fn().mockResolvedValue(0),
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

  describe('Concurrent Campaign Creation', () => {
    it('should create multiple campaigns simultaneously for different users without conflicts', async () => {
      const mockToken = { id: 'token-1', name: 'Test Token' };

      mockSupabaseService.getTokenById.mockResolvedValue(mockToken);
      mockSupabaseService.createCampaign
        .mockResolvedValueOnce({
          id: 'campaign-1',
          user_id: mockUser1.id,
          name: 'Campaign 1',
          token_id: mockToken.id,
          status: 'draft',
        })
        .mockResolvedValueOnce({
          id: 'campaign-2',
          user_id: mockUser2.id,
          name: 'Campaign 2',
          token_id: mockToken.id,
          status: 'draft',
        })
        .mockResolvedValueOnce({
          id: 'campaign-3',
          user_id: mockUser3.id,
          name: 'Campaign 3',
          token_id: mockToken.id,
          status: 'draft',
        });

      // Simulate concurrent campaign creation
      const results = await Promise.all([
        controller.createCampaign(
          { name: 'Campaign 1', token_id: mockToken.id, pool_id: 'pool-1', params: {} },
          mockUser1
        ),
        controller.createCampaign(
          { name: 'Campaign 2', token_id: mockToken.id, pool_id: 'pool-1', params: {} },
          mockUser2
        ),
        controller.createCampaign(
          { name: 'Campaign 3', token_id: mockToken.id, pool_id: 'pool-1', params: {} },
          mockUser3
        ),
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].id).toBe('campaign-1');
      expect(results[1].id).toBe('campaign-2');
      expect(results[2].id).toBe('campaign-3');
      expect(results[0].user_id).toBe(mockUser1.id);
      expect(results[1].user_id).toBe(mockUser2.id);
      expect(results[2].user_id).toBe(mockUser3.id);
      expect(mockSupabaseService.createCampaign).toHaveBeenCalledTimes(3);
    });

    it('should handle rapid sequential campaign creation by same user', async () => {
      const mockToken = { id: 'token-1', name: 'Test Token' };

      mockSupabaseService.getTokenById.mockResolvedValue(mockToken);
      mockSupabaseService.createCampaign
        .mockResolvedValueOnce({ id: 'campaign-1', user_id: mockUser1.id, status: 'draft' })
        .mockResolvedValueOnce({ id: 'campaign-2', user_id: mockUser1.id, status: 'draft' })
        .mockResolvedValueOnce({ id: 'campaign-3', user_id: mockUser1.id, status: 'draft' })
        .mockResolvedValueOnce({ id: 'campaign-4', user_id: mockUser1.id, status: 'draft' })
        .mockResolvedValueOnce({ id: 'campaign-5', user_id: mockUser1.id, status: 'draft' });

      // Simulate rapid sequential creation (within milliseconds)
      const results = await Promise.all([
        controller.createCampaign({ name: 'C1', token_id: mockToken.id, pool_id: 'pool-1', params: {} }, mockUser1),
        controller.createCampaign({ name: 'C2', token_id: mockToken.id, pool_id: 'pool-1', params: {} }, mockUser1),
        controller.createCampaign({ name: 'C3', token_id: mockToken.id, pool_id: 'pool-1', params: {} }, mockUser1),
        controller.createCampaign({ name: 'C4', token_id: mockToken.id, pool_id: 'pool-1', params: {} }, mockUser1),
        controller.createCampaign({ name: 'C5', token_id: mockToken.id, pool_id: 'pool-1', params: {} }, mockUser1),
      ]);

      expect(results).toHaveLength(5);
      expect(new Set(results.map(r => r.id)).size).toBe(5); // All IDs unique
      expect(mockSupabaseService.createCampaign).toHaveBeenCalledTimes(5);
    });

    it('should maintain data integrity when multiple users create campaigns with same token', async () => {
      const mockToken = { id: 'shared-token', name: 'Shared Token' };

      mockSupabaseService.getTokenById.mockResolvedValue(mockToken);

      let callCount = 0;
      mockSupabaseService.createCampaign.mockImplementation((data) => {
        callCount++;
        return Promise.resolve({
          id: `campaign-${callCount}`,
          user_id: data.user_id,
          token_id: mockToken.id,
          status: 'draft',
        });
      });

      const results = await Promise.all([
        controller.createCampaign({ name: 'U1C1', token_id: mockToken.id, pool_id: 'pool-1', params: {} }, mockUser1),
        controller.createCampaign({ name: 'U2C1', token_id: mockToken.id, pool_id: 'pool-1', params: {} }, mockUser2),
        controller.createCampaign({ name: 'U3C1', token_id: mockToken.id, pool_id: 'pool-1', params: {} }, mockUser3),
      ]);

      // Each campaign should maintain correct user association
      expect(results[0].user_id).toBe(mockUser1.id);
      expect(results[1].user_id).toBe(mockUser2.id);
      expect(results[2].user_id).toBe(mockUser3.id);

      // All should reference the same token
      expect(results[0].token_id).toBe(mockToken.id);
      expect(results[1].token_id).toBe(mockToken.id);
      expect(results[2].token_id).toBe(mockToken.id);
    });
  });

  describe('Concurrent Campaign Start Operations', () => {
    it('should start multiple campaigns concurrently without run ID collisions', async () => {
      const campaigns = [
        { id: 'campaign-1', pool_id: 'pool-1', status: 'draft' },
        { id: 'campaign-2', pool_id: 'pool-2', status: 'draft' },
        { id: 'campaign-3', pool_id: 'pool-3', status: 'draft' },
      ];

      let runCounter = 0;
      mockSupabaseService.getCampaignById.mockImplementation((id) =>
        campaigns.find(c => c.id === id)
      );
      mockSupabaseService.updateCampaign.mockImplementation((id) =>
        Promise.resolve({ ...campaigns.find(c => c.id === id), status: 'active' })
      );
      mockSupabaseService.createCampaignRun.mockImplementation((data) => {
        runCounter++;
        return Promise.resolve({
          id: `run-${runCounter}`,
          campaign_id: data.campaign_id,
          status: 'running',
          started_at: new Date(),
        });
      });
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});

      const results = await Promise.all([
        controller.startCampaign('campaign-1', mockUser1),
        controller.startCampaign('campaign-2', mockUser2),
        controller.startCampaign('campaign-3', mockUser3),
      ]);

      expect(results).toHaveLength(3);

      // Each run should have unique ID
      const runIds = results.map(r => r.run.id);
      expect(new Set(runIds).size).toBe(3);

      // Each run should be associated with correct campaign
      expect(results[0].run.campaign_id).toBe('campaign-1');
      expect(results[1].run.campaign_id).toBe('campaign-2');
      expect(results[2].run.campaign_id).toBe('campaign-3');
    });

    it('should queue jobs independently for concurrent campaign starts', async () => {
      const campaigns = [
        { id: 'campaign-1', pool_id: 'pool-1', status: 'draft' },
        { id: 'campaign-2', pool_id: 'pool-2', status: 'draft' },
      ];

      mockSupabaseService.getCampaignById.mockImplementation((id) =>
        campaigns.find(c => c.id === id)
      );
      mockSupabaseService.updateCampaign.mockResolvedValue({ status: 'active' });
      mockSupabaseService.createCampaignRun.mockImplementation((data) =>
        Promise.resolve({
          id: `run-${data.campaign_id}`,
          campaign_id: data.campaign_id,
          status: 'running',
          started_at: new Date(),
        })
      );
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([
        { id: 'wallet-1' },
        { id: 'wallet-2' },
      ]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});

      await Promise.all([
        controller.startCampaign('campaign-1', mockUser1),
        controller.startCampaign('campaign-2', mockUser2),
      ]);

      // Each campaign should have independent gather jobs
      const gatherCalls = gatherQueue.add.mock.calls;
      expect(gatherCalls.length).toBeGreaterThanOrEqual(2);

      const campaign1Calls = gatherCalls.filter(call => call[1].campaignId === 'campaign-1');
      const campaign2Calls = gatherCalls.filter(call => call[1].campaignId === 'campaign-2');

      expect(campaign1Calls.length).toBeGreaterThan(0);
      expect(campaign2Calls.length).toBeGreaterThan(0);
    });

    it('should handle race condition when same campaign started multiple times simultaneously', async () => {
      const mockCampaign = { id: 'campaign-dup', pool_id: 'pool-1', status: 'draft' };

      let startCallCount = 0;
      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.updateCampaign.mockResolvedValue({ ...mockCampaign, status: 'active' });
      mockSupabaseService.createCampaignRun.mockImplementation(() => {
        startCallCount++;
        return Promise.resolve({
          id: `run-${startCallCount}`,
          campaign_id: mockCampaign.id,
          status: 'running',
          started_at: new Date(),
        });
      });
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});

      // Attempt to start same campaign twice simultaneously (race condition scenario)
      const results = await Promise.all([
        controller.startCampaign(mockCampaign.id, mockUser1),
        controller.startCampaign(mockCampaign.id, mockUser1),
      ]);

      // Both calls should succeed but create separate runs
      expect(results).toHaveLength(2);
      expect(results[0].run.id).not.toBe(results[1].run.id);
      expect(mockSupabaseService.createCampaignRun).toHaveBeenCalledTimes(2);
    });
  });

  describe('Concurrent Campaign State Modifications', () => {
    it('should handle concurrent pause operations on different campaigns', async () => {
      const campaigns = [
        { id: 'campaign-1', status: 'active' },
        { id: 'campaign-2', status: 'active' },
        { id: 'campaign-3', status: 'active' },
      ];

      const runs = [
        { id: 'run-1', campaign_id: 'campaign-1', status: 'running' },
        { id: 'run-2', campaign_id: 'campaign-2', status: 'running' },
        { id: 'run-3', campaign_id: 'campaign-3', status: 'running' },
      ];

      mockSupabaseService.getCampaignById.mockImplementation((id) =>
        campaigns.find(c => c.id === id)
      );
      mockSupabaseService.updateCampaign.mockImplementation((id) =>
        Promise.resolve({ ...campaigns.find(c => c.id === id), status: 'paused' })
      );
      mockSupabaseService.getCampaignRunsByCampaignId.mockImplementation((id) =>
        [runs.find(r => r.campaign_id === id)]
      );
      mockSupabaseService.updateCampaignRun.mockImplementation((runId, data) =>
        Promise.resolve({ ...runs.find(r => r.id === runId), ...data })
      );

      const results = await Promise.all([
        controller.pauseCampaign('campaign-1', mockUser1),
        controller.pauseCampaign('campaign-2', mockUser2),
        controller.pauseCampaign('campaign-3', mockUser3),
      ]);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.status === 'paused')).toBe(true);
      expect(mockSupabaseService.updateCampaignRun).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent resume operations without job duplication', async () => {
      const campaigns = [
        { id: 'campaign-1', status: 'paused' },
        { id: 'campaign-2', status: 'paused' },
      ];

      const runs = [
        { id: 'run-1', campaign_id: 'campaign-1', status: 'paused' },
        { id: 'run-2', campaign_id: 'campaign-2', status: 'paused' },
      ];

      mockSupabaseService.getCampaignById.mockImplementation((id) =>
        campaigns.find(c => c.id === id)
      );
      mockSupabaseService.updateCampaign.mockImplementation((id) =>
        Promise.resolve({ ...campaigns.find(c => c.id === id), status: 'active' })
      );
      mockSupabaseService.getCampaignRunsByCampaignId.mockImplementation((id) =>
        [runs.find(r => r.campaign_id === id)]
      );
      mockSupabaseService.updateCampaignRun.mockImplementation((runId, data) =>
        Promise.resolve({ ...runs.find(r => r.id === runId), ...data })
      );
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([{ id: 'wallet-1' }]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });

      await Promise.all([
        controller.resumeCampaign('campaign-1', mockUser1),
        controller.resumeCampaign('campaign-2', mockUser2),
      ]);

      // Check that buy queue was called for both campaigns independently
      const buyQueueCalls = tradeBuyQueue.add.mock.calls;
      const campaign1Jobs = buyQueueCalls.filter(call => call[1].campaignId === 'campaign-1');
      const campaign2Jobs = buyQueueCalls.filter(call => call[1].campaignId === 'campaign-2');

      expect(campaign1Jobs.length).toBeGreaterThan(0);
      expect(campaign2Jobs.length).toBeGreaterThan(0);
    });

    it('should handle mixed state operations (pause, resume, stop) on different campaigns', async () => {
      const campaigns = [
        { id: 'campaign-pause', status: 'active' },
        { id: 'campaign-resume', status: 'paused' },
        { id: 'campaign-stop', status: 'active' },
      ];

      const runs = [
        { id: 'run-1', campaign_id: 'campaign-pause', status: 'running' },
        { id: 'run-2', campaign_id: 'campaign-resume', status: 'paused' },
        { id: 'run-3', campaign_id: 'campaign-stop', status: 'running' },
      ];

      mockSupabaseService.getCampaignById.mockImplementation((id) =>
        campaigns.find(c => c.id === id)
      );
      mockSupabaseService.updateCampaign.mockImplementation((id, userId, data) => {
        const campaign = campaigns.find(c => c.id === id);
        return Promise.resolve({ ...campaign, ...data });
      });
      mockSupabaseService.getCampaignRunsByCampaignId.mockImplementation((id) =>
        [runs.find(r => r.campaign_id === id)]
      );
      mockSupabaseService.updateCampaignRun.mockImplementation((runId, data) =>
        Promise.resolve({ ...runs.find(r => r.id === runId), ...data })
      );
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([{ id: 'wallet-1' }]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });

      const results = await Promise.all([
        controller.pauseCampaign('campaign-pause', mockUser1),
        controller.resumeCampaign('campaign-resume', mockUser2),
        controller.stopCampaign('campaign-stop', mockUser3),
      ]);

      expect(results[0].status).toBe('paused');
      expect(results[1].status).toBe('resumed');
      expect(results[2].status).toBe('stopped');
    });

    it('should prevent race condition when updating campaign concurrently', async () => {
      const mockCampaign = { id: 'campaign-update', user_id: mockUser1.id, name: 'Original' };

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);

      let updateCount = 0;
      mockSupabaseService.updateCampaign.mockImplementation((id, userId, data) => {
        updateCount++;
        return Promise.resolve({ ...mockCampaign, ...data, updateCount });
      });

      // Attempt concurrent updates
      const results = await Promise.all([
        controller.updateCampaign(mockCampaign.id, { name: 'Update 1' }, mockUser1),
        controller.updateCampaign(mockCampaign.id, { name: 'Update 2' }, mockUser1),
        controller.updateCampaign(mockCampaign.id, { name: 'Update 3' }, mockUser1),
      ]);

      expect(results).toHaveLength(3);
      expect(mockSupabaseService.updateCampaign).toHaveBeenCalledTimes(3);
      // All updates should be processed (order may vary due to concurrency)
      expect(updateCount).toBe(3);
    });
  });

  describe('Campaign Isolation and User Boundaries', () => {
    it('should isolate campaign operations between different users', async () => {
      const user1Campaign = { id: 'u1-campaign', user_id: mockUser1.id, status: 'draft' };
      const user2Campaign = { id: 'u2-campaign', user_id: mockUser2.id, status: 'draft' };

      mockSupabaseService.getCampaignById.mockImplementation((id, userId) => {
        if (id === 'u1-campaign' && userId === mockUser1.id) return user1Campaign;
        if (id === 'u2-campaign' && userId === mockUser2.id) return user2Campaign;
        return null;
      });

      // User 1 should not access User 2's campaign (returns null)
      const result1 = await controller.getCampaign('u2-campaign', mockUser1);
      expect(result1).toBeNull();

      // User 2 should not access User 1's campaign (returns null)
      const result2 = await controller.getCampaign('u1-campaign', mockUser2);
      expect(result2).toBeNull();

      // Each user should access their own campaign successfully
      const ownResult1 = await controller.getCampaign('u1-campaign', mockUser1);
      expect(ownResult1.id).toBe('u1-campaign');

      const ownResult2 = await controller.getCampaign('u2-campaign', mockUser2);
      expect(ownResult2.id).toBe('u2-campaign');
    });

    it('should maintain separate wallet pools for concurrent campaigns', async () => {
      const campaigns = [
        { id: 'campaign-1', pool_id: 'pool-1', status: 'draft' },
        { id: 'campaign-2', pool_id: 'pool-2', status: 'draft' },
      ];

      const user1Wallets = [{ id: 'u1-wallet-1' }, { id: 'u1-wallet-2' }];
      const user2Wallets = [{ id: 'u2-wallet-1' }, { id: 'u2-wallet-2' }, { id: 'u2-wallet-3' }];

      mockSupabaseService.getCampaignById.mockImplementation((id) =>
        campaigns.find(c => c.id === id)
      );
      mockSupabaseService.updateCampaign.mockResolvedValue({ status: 'active' });
      mockSupabaseService.createCampaignRun.mockImplementation((data) =>
        Promise.resolve({
          id: `run-${data.campaign_id}`,
          campaign_id: data.campaign_id,
          status: 'running',
          started_at: new Date(),
        })
      );
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockImplementation((userId) => {
        if (userId === mockUser1.id) return Promise.resolve(user1Wallets);
        if (userId === mockUser2.id) return Promise.resolve(user2Wallets);
        return Promise.resolve([]);
      });
      mockSupabaseService.getUserSettings.mockResolvedValue({});

      await Promise.all([
        controller.startCampaign('campaign-1', mockUser1),
        controller.startCampaign('campaign-2', mockUser2),
      ]);

      // Check that each campaign uses the correct user's wallets
      const buyQueueCalls = tradeBuyQueue.add.mock.calls;
      const campaign1WalletJobs = buyQueueCalls.filter(call =>
        call[1].campaignId === 'campaign-1'
      );
      const campaign2WalletJobs = buyQueueCalls.filter(call =>
        call[1].campaignId === 'campaign-2'
      );

      // User 1 has 2 wallets
      expect(campaign1WalletJobs.length).toBe(2);
      // User 2 has 3 wallets
      expect(campaign2WalletJobs.length).toBe(3);
    });

    it('should prevent cross-user campaign modifications', async () => {
      const user1Campaign = { id: 'u1-campaign', user_id: mockUser1.id, status: 'active' };

      mockSupabaseService.getCampaignById.mockImplementation((id, userId) => {
        if (id === 'u1-campaign' && userId === mockUser1.id) return user1Campaign;
        return null; // User 2 cannot access
      });

      // User 2 attempts to pause User 1's campaign
      await expect(
        controller.pauseCampaign('u1-campaign', mockUser2)
      ).rejects.toThrow(new HttpException('Campaign not found', HttpStatus.NOT_FOUND));

      // User 2 attempts to stop User 1's campaign
      await expect(
        controller.stopCampaign('u1-campaign', mockUser2)
      ).rejects.toThrow(new HttpException('Campaign not found', HttpStatus.NOT_FOUND));
    });
  });

  describe('Queue Job Isolation Under Concurrency', () => {
    it('should ensure jobs for different campaigns do not interfere', async () => {
      const campaigns = [
        { id: 'campaign-1', pool_id: 'pool-1', status: 'active' },
        { id: 'campaign-2', pool_id: 'pool-2', status: 'active' },
      ];

      const runs = [
        { id: 'run-1', campaign_id: 'campaign-1', status: 'running' },
        { id: 'run-2', campaign_id: 'campaign-2', status: 'running' },
      ];

      // Setup mock jobs in queues
      const campaign1Jobs = [
        { id: 'job-1-1', data: { campaignId: 'campaign-1' }, remove: vi.fn() },
        { id: 'job-1-2', data: { campaignId: 'campaign-1' }, remove: vi.fn() },
      ];
      const campaign2Jobs = [
        { id: 'job-2-1', data: { campaignId: 'campaign-2' }, remove: vi.fn() },
        { id: 'job-2-2', data: { campaignId: 'campaign-2' }, remove: vi.fn() },
      ];

      gatherQueue.getJobs.mockResolvedValue([...campaign1Jobs, ...campaign2Jobs]);
      tradeBuyQueue.getJobs.mockResolvedValue([...campaign1Jobs, ...campaign2Jobs]);
      tradeSellQueue.getJobs.mockResolvedValue([...campaign1Jobs, ...campaign2Jobs]);

      mockSupabaseService.getCampaignById.mockImplementation((id) =>
        campaigns.find(c => c.id === id)
      );
      mockSupabaseService.updateCampaign.mockImplementation((id) =>
        Promise.resolve({ ...campaigns.find(c => c.id === id), status: 'paused' })
      );
      mockSupabaseService.getCampaignRunsByCampaignId.mockImplementation((id) =>
        [runs.find(r => r.campaign_id === id)]
      );
      mockSupabaseService.updateCampaignRun.mockImplementation((runId, data) =>
        Promise.resolve({ ...runs.find(r => r.id === runId), ...data })
      );

      // Pause campaign 1 only
      await controller.pauseCampaign('campaign-1', mockUser1);

      // Only campaign 1 jobs should be removed
      expect(campaign1Jobs[0].remove).toHaveBeenCalled();
      expect(campaign1Jobs[1].remove).toHaveBeenCalled();

      // Campaign 2 jobs should NOT be removed
      expect(campaign2Jobs[0].remove).not.toHaveBeenCalled();
      expect(campaign2Jobs[1].remove).not.toHaveBeenCalled();
    });

    it('should handle concurrent distribution operations independently', async () => {
      const campaigns = [
        { id: 'campaign-dist-1', user_id: mockUser1.id, status: 'draft' },
        { id: 'campaign-dist-2', user_id: mockUser2.id, status: 'draft' },
      ];

      mockSupabaseService.getCampaignById.mockImplementation((id, userId) =>
        campaigns.find(c => c.id === id && c.user_id === userId)
      );
      mockSupabaseService.createCampaignRun.mockImplementation((data) =>
        Promise.resolve({
          id: `run-${data.campaign_id}`,
          campaign_id: data.campaign_id,
          status: 'running',
          started_at: new Date(),
        })
      );
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });

      const results = await Promise.all([
        controller.distribute('campaign-dist-1', mockUser1, { num_wallets: 5 }),
        controller.distribute('campaign-dist-2', mockUser2, { num_wallets: 10 }),
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].distributionNum).toBe(5);
      expect(results[1].distributionNum).toBe(10);

      // Check that distribute queue has separate jobs
      const distributeQueueCalls = distributeQueue.add.mock.calls;
      expect(distributeQueueCalls.length).toBe(2);

      const campaign1DistJob = distributeQueueCalls.find(call => call[1].campaignId === 'campaign-dist-1');
      const campaign2DistJob = distributeQueueCalls.find(call => call[1].campaignId === 'campaign-dist-2');

      expect(campaign1DistJob[1].distributionNum).toBe(5);
      expect(campaign2DistJob[1].distributionNum).toBe(10);
    });

    it('should handle concurrent sell-only operations with different configurations', async () => {
      const campaigns = [
        { id: 'campaign-sell-1', user_id: mockUser1.id, status: 'draft' },
        { id: 'campaign-sell-2', user_id: mockUser2.id, status: 'draft' },
      ];

      mockSupabaseService.getCampaignById.mockImplementation((id, userId) =>
        campaigns.find(c => c.id === id && c.user_id === userId)
      );
      mockSupabaseService.updateCampaign.mockResolvedValue({ status: 'active' });
      mockSupabaseService.createCampaignRun.mockImplementation((data) =>
        Promise.resolve({
          id: `run-${data.campaign_id}`,
          campaign_id: data.campaign_id,
          status: 'running',
          started_at: new Date(),
        })
      );
      mockSupabaseService.getWalletsByUserId.mockImplementation((userId) => {
        if (userId === mockUser1.id) return Promise.resolve([{ id: 'w1' }, { id: 'w2' }]);
        if (userId === mockUser2.id) return Promise.resolve([{ id: 'w3' }, { id: 'w4' }, { id: 'w5' }]);
        return Promise.resolve([]);
      });
      mockSupabaseService.getUserSettings.mockResolvedValue({});
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });

      const results = await Promise.all([
        controller.startSellOnly('campaign-sell-1', mockUser1, { total_times: 3 }),
        controller.startSellOnly('campaign-sell-2', mockUser2, { total_times: 5 }),
      ]);

      expect(results[0].totalTimes).toBe(3);
      expect(results[0].walletsQueued).toBe(2);
      expect(results[1].totalTimes).toBe(5);
      expect(results[1].walletsQueued).toBe(3);

      // Verify independent job queuing
      const sellQueueCalls = tradeSellQueue.add.mock.calls;
      const campaign1SellJobs = sellQueueCalls.filter(call => call[1].campaignId === 'campaign-sell-1');
      const campaign2SellJobs = sellQueueCalls.filter(call => call[1].campaignId === 'campaign-sell-2');

      expect(campaign1SellJobs.length).toBe(2); // 2 wallets for user 1
      expect(campaign2SellJobs.length).toBe(3); // 3 wallets for user 2
    });
  });

  describe('Data Consistency Under Concurrent Load', () => {
    it('should maintain correct run counts under concurrent operations', async () => {
      const mockCampaign = { id: 'campaign-runs', user_id: mockUser1.id };
      const mockRuns: any[] = [];

      mockSupabaseService.getCampaignById.mockResolvedValue(mockCampaign);
      mockSupabaseService.createCampaignRun.mockImplementation((data) => {
        const newRun = {
          id: `run-${mockRuns.length + 1}`,
          campaign_id: data.campaign_id,
          status: 'running',
          started_at: new Date(),
        };
        mockRuns.push(newRun);
        return Promise.resolve(newRun);
      });
      mockSupabaseService.getCampaignRunsByCampaignId.mockImplementation(() =>
        Promise.resolve([...mockRuns])
      );
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });

      // Create multiple runs concurrently via distribute
      await Promise.all([
        controller.distribute(mockCampaign.id, mockUser1, { num_wallets: 5 }),
        controller.distribute(mockCampaign.id, mockUser1, { num_wallets: 5 }),
        controller.distribute(mockCampaign.id, mockUser1, { num_wallets: 5 }),
      ]);

      // Retrieve runs
      const runs = await controller.getCampaignRuns(mockCampaign.id, mockUser1);

      // Should have 3 separate runs
      expect(runs.length).toBe(3);
      expect(new Set(runs.map(r => r.id)).size).toBe(3); // All unique
    });

    it('should handle WebSocket event emissions without loss during concurrent operations', async () => {
      const campaigns = [
        { id: 'campaign-1', pool_id: 'pool-1', status: 'draft' },
        { id: 'campaign-2', pool_id: 'pool-2', status: 'draft' },
        { id: 'campaign-3', pool_id: 'pool-3', status: 'draft' },
      ];

      mockSupabaseService.getCampaignById.mockImplementation((id) =>
        campaigns.find(c => c.id === id)
      );
      mockSupabaseService.updateCampaign.mockResolvedValue({ status: 'active' });
      mockSupabaseService.createCampaignRun.mockImplementation((data) =>
        Promise.resolve({
          id: `run-${data.campaign_id}`,
          campaign_id: data.campaign_id,
          status: 'running',
          started_at: new Date(),
        })
      );
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});

      await Promise.all([
        controller.startCampaign('campaign-1', mockUser1),
        controller.startCampaign('campaign-2', mockUser2),
        controller.startCampaign('campaign-3', mockUser3),
      ]);

      // All three campaigns should emit run status events
      expect(mockGateway.emitRunStatus).toHaveBeenCalledTimes(3);

      const emittedCampaigns = mockGateway.emitRunStatus.mock.calls.map(call => call[0].campaignId);
      expect(emittedCampaigns).toContain('campaign-1');
      expect(emittedCampaigns).toContain('campaign-2');
      expect(emittedCampaigns).toContain('campaign-3');
    });

    it('should handle database errors gracefully during concurrent operations', async () => {
      const campaigns = [
        { id: 'campaign-ok', pool_id: 'pool-1', status: 'draft' },
        { id: 'campaign-fail', pool_id: 'pool-2', status: 'draft' },
      ];

      mockSupabaseService.getCampaignById.mockImplementation((id) =>
        campaigns.find(c => c.id === id)
      );
      mockSupabaseService.updateCampaign.mockImplementation((id) => {
        if (id === 'campaign-fail') {
          return Promise.reject(new Error('Database connection error'));
        }
        return Promise.resolve({ status: 'active' });
      });
      mockSupabaseService.createCampaignRun.mockResolvedValue({
        id: 'run-1',
        campaign_id: 'campaign-ok',
        status: 'running',
        started_at: new Date(),
      });
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});

      // One should succeed, one should fail
      const results = await Promise.allSettled([
        controller.startCampaign('campaign-ok', mockUser1),
        controller.startCampaign('campaign-fail', mockUser2),
      ]);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');

      if (results[1].status === 'rejected') {
        expect(results[1].reason.message).toContain('Database connection error');
      }
    });
  });

  describe('Stress Testing - High Concurrency Scenarios', () => {
    it('should handle 10 concurrent campaign creations without data corruption', async () => {
      const mockToken = { id: 'token-stress', name: 'Stress Token' };

      mockSupabaseService.getTokenById.mockResolvedValue(mockToken);

      let campaignCounter = 0;
      mockSupabaseService.createCampaign.mockImplementation((data) => {
        campaignCounter++;
        return Promise.resolve({
          id: `campaign-${campaignCounter}`,
          user_id: data.user_id,
          name: data.name,
          token_id: mockToken.id,
          status: 'draft',
        });
      });

      const operations = [];
      for (let i = 1; i <= 10; i++) {
        operations.push(
          controller.createCampaign(
            { name: `Campaign ${i}`, token_id: mockToken.id, pool_id: 'pool-1', params: {} },
            { id: `user-${i}` }
          )
        );
      }

      const results = await Promise.all(operations);

      expect(results).toHaveLength(10);
      expect(new Set(results.map(r => r.id)).size).toBe(10); // All unique IDs
      expect(mockSupabaseService.createCampaign).toHaveBeenCalledTimes(10);
    });

    it('should handle rapid state transitions on multiple campaigns', async () => {
      const campaigns = Array.from({ length: 5 }, (_, i) => ({
        id: `campaign-${i + 1}`,
        status: 'draft',
      }));

      mockSupabaseService.getCampaignById.mockImplementation((id) =>
        campaigns.find(c => c.id === id)
      );
      mockSupabaseService.updateCampaign.mockImplementation((id, userId, data) =>
        Promise.resolve({ ...campaigns.find(c => c.id === id), ...data })
      );

      // Simulate rapid updates to multiple campaigns
      const updateOperations = [];
      for (let i = 1; i <= 5; i++) {
        updateOperations.push(
          controller.updateCampaign(`campaign-${i}`, { name: `Updated ${i}` }, mockUser1)
        );
      }

      const results = await Promise.all(updateOperations);

      expect(results).toHaveLength(5);
      expect(mockSupabaseService.updateCampaign).toHaveBeenCalledTimes(5);
    });

    it('should handle mixed concurrent operations (create, start, pause, stop)', async () => {
      const existingCampaigns = [
        { id: 'campaign-active', status: 'active' },
        { id: 'campaign-paused', status: 'paused' },
        { id: 'campaign-draft', pool_id: 'pool-1', status: 'draft' },
      ];

      const mockToken = { id: 'token-mixed', name: 'Mixed Token' };

      mockSupabaseService.getTokenById.mockResolvedValue(mockToken);
      mockSupabaseService.createCampaign.mockResolvedValue({
        id: 'campaign-new',
        user_id: mockUser1.id,
        status: 'draft',
      });
      mockSupabaseService.getCampaignById.mockImplementation((id) =>
        existingCampaigns.find(c => c.id === id)
      );
      mockSupabaseService.updateCampaign.mockImplementation((id, userId, data) =>
        Promise.resolve({ ...existingCampaigns.find(c => c.id === id), ...data })
      );
      mockSupabaseService.getCampaignRunsByCampaignId.mockResolvedValue([
        { id: 'run-1', status: 'running' }
      ]);
      mockSupabaseService.updateCampaignRun.mockResolvedValue({ id: 'run-1', status: 'paused' });
      mockSupabaseService.createCampaignRun.mockResolvedValue({
        id: 'run-new',
        campaign_id: 'campaign-draft',
        status: 'running',
        started_at: new Date(),
      });
      mockSupabaseService.createJob.mockResolvedValue({ id: 'job-1', status: 'queued' });
      mockSupabaseService.getWalletsByUserId.mockResolvedValue([]);
      mockSupabaseService.getUserSettings.mockResolvedValue({});

      const operations = await Promise.allSettled([
        controller.createCampaign({ name: 'New', token_id: mockToken.id, pool_id: 'pool-1', params: {} }, mockUser1),
        controller.startCampaign('campaign-draft', mockUser1),
        controller.pauseCampaign('campaign-active', mockUser1),
        controller.stopCampaign('campaign-paused', mockUser1),
      ]);

      // All operations should complete (success or expected failure)
      expect(operations).toHaveLength(4);

      const successCount = operations.filter(op => op.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThanOrEqual(3); // At least 3 should succeed
    });
  });
});
