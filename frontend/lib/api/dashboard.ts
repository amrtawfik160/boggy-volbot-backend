import { apiClient } from './client';

export interface DashboardMetrics {
  activeCampaigns: number;
  volume24h: number;
  totalTransactions: number;
  successRate: number;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'campaign_started' | 'campaign_stopped' | 'trade_executed' | 'error';
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export const dashboardApi = {
  async getMetrics(): Promise<DashboardMetrics> {
    return apiClient.get<DashboardMetrics>('/v1/dashboard/metrics');
  },

  async getActivity(limit = 20): Promise<ActivityItem[]> {
    return apiClient.get<ActivityItem[]>(`/v1/dashboard/activity?limit=${limit}`);
  },
};

