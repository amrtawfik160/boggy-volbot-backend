import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from '../dashboard.controller';
import { SupabaseService } from '../../../services/supabase.service';

describe('DashboardController Integration Tests', () => {
  let controller: DashboardController;
  let supabaseService: any;

  const mockUser = { id: 'test-user-123' };

  beforeEach(async () => {
    const mockSupabaseService = {
      getCampaignsByUserId: vi.fn(),
      getRecentExecutions: vi.fn(),
      getRecentActivity: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: SupabaseService,
          useValue: mockSupabaseService,
        },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
    supabaseService = module.get(SupabaseService);

    vi.clearAllMocks();
  });

  describe('getMetrics', () => {
    it('should return dashboard metrics with active campaigns and 24h stats', async () => {
      const mockCampaigns = [
        { id: 'c1', status: 'active', name: 'Campaign 1' },
        { id: 'c2', status: 'draft', name: 'Campaign 2' },
        { id: 'c3', status: 'active', name: 'Campaign 3' },
      ];

      const mockExecutions = [
        { id: 'e1', result: { success: true, amount: 0.5 } },
        { id: 'e2', result: { success: true, amount: 1.2 } },
        { id: 'e3', result: { success: false, amount: 0 } },
        { id: 'e4', result: { success: true, amount: 0.8 } },
      ];

      const mockActivity = [
        {
          id: 'a1',
          action: 'campaign_started',
          entity: 'campaign',
          created_at: new Date(),
          metadata: { message: 'Campaign started' },
        },
      ];

      supabaseService.getCampaignsByUserId.mockResolvedValue(mockCampaigns);
      supabaseService.getRecentExecutions.mockResolvedValue(mockExecutions);
      supabaseService.getRecentActivity.mockResolvedValue(mockActivity);

      const result = await controller.getMetrics(mockUser);

      expect(result).toEqual({
        activeCampaigns: 2,
        volume24h: 2.5,
        totalTransactions: 4,
        successRate: 0.75,
        recentActivity: [
          {
            id: 'a1',
            type: 'campaign_started',
            message: 'Campaign started',
            timestamp: mockActivity[0].created_at,
            metadata: { message: 'Campaign started' },
          },
        ],
      });

      expect(supabaseService.getCampaignsByUserId).toHaveBeenCalledWith(mockUser.id);
      expect(supabaseService.getRecentExecutions).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(Date)
      );
      expect(supabaseService.getRecentActivity).toHaveBeenCalledWith(mockUser.id, 20);
    });

    it('should handle no campaigns correctly', async () => {
      supabaseService.getCampaignsByUserId.mockResolvedValue([]);
      supabaseService.getRecentExecutions.mockResolvedValue([]);
      supabaseService.getRecentActivity.mockResolvedValue([]);

      const result = await controller.getMetrics(mockUser);

      expect(result).toEqual({
        activeCampaigns: 0,
        volume24h: 0,
        totalTransactions: 0,
        successRate: 0,
        recentActivity: [],
      });
    });

    it('should handle executions without result amounts', async () => {
      const mockCampaigns = [{ id: 'c1', status: 'active', name: 'Campaign 1' }];
      const mockExecutions = [
        { id: 'e1', result: { success: true } },
        { id: 'e2', result: null },
      ];

      supabaseService.getCampaignsByUserId.mockResolvedValue(mockCampaigns);
      supabaseService.getRecentExecutions.mockResolvedValue(mockExecutions);
      supabaseService.getRecentActivity.mockResolvedValue([]);

      const result = await controller.getMetrics(mockUser);

      expect(result.volume24h).toBe(0);
      expect(result.totalTransactions).toBe(2);
    });

    it('should generate default activity messages when metadata is missing', async () => {
      supabaseService.getCampaignsByUserId.mockResolvedValue([]);
      supabaseService.getRecentExecutions.mockResolvedValue([]);
      supabaseService.getRecentActivity.mockResolvedValue([
        {
          id: 'a1',
          action: 'wallet_created',
          entity: 'wallet',
          created_at: new Date(),
          metadata: null,
        },
      ]);

      const result = await controller.getMetrics(mockUser);

      expect(result.recentActivity[0].message).toBe('wallet_created on wallet');
    });
  });

  describe('getActivity', () => {
    it('should return recent activity with default limit of 20', async () => {
      const mockActivities = [
        {
          id: 'a1',
          action: 'campaign_created',
          entity: 'campaign',
          created_at: new Date(),
          metadata: { message: 'New campaign' },
        },
        {
          id: 'a2',
          action: 'wallet_added',
          entity: 'wallet',
          created_at: new Date(),
          metadata: { message: 'Wallet added' },
        },
      ];

      supabaseService.getRecentActivity.mockResolvedValue(mockActivities);

      const result = await controller.getActivity(mockUser);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('campaign_created');
      expect(result[1].type).toBe('wallet_added');
      expect(supabaseService.getRecentActivity).toHaveBeenCalledWith(mockUser.id, 20);
    });

    it('should respect custom limit parameter', async () => {
      supabaseService.getRecentActivity.mockResolvedValue([]);

      await controller.getActivity(mockUser, '50');

      expect(supabaseService.getRecentActivity).toHaveBeenCalledWith(mockUser.id, 50);
    });

    it('should handle empty activity list', async () => {
      supabaseService.getRecentActivity.mockResolvedValue([]);

      const result = await controller.getActivity(mockUser);

      expect(result).toEqual([]);
    });
  });
});
