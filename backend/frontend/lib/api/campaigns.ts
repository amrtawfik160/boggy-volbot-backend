import { apiClient } from './client';

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  token_id: string;
  pool_id: string;
  params: {
    slippage?: number;
    minTxSize?: number;
    maxTxSize?: number;
    targetVolume?: number;
    schedule?: string;
    useJito?: boolean;
    jitoTip?: number;
    walletIds?: string[];
  };
  status: 'draft' | 'active' | 'paused' | 'stopped' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface CampaignRun {
  id: string;
  campaign_id: string;
  started_at: string;
  ended_at?: string;
  status: 'running' | 'paused' | 'stopped' | 'completed' | 'failed';
  summary?: {
    totalVolume?: number;
    totalTransactions?: number;
    successRate?: number;
  };
}

export interface CampaignStatus {
  campaign: Campaign;
  latestRun?: CampaignRun;
  queueStats: {
    gather: { waiting: number; active: number };
    buy: { waiting: number; active: number };
    sell: { waiting: number; active: number };
  };
}

export interface CreateCampaignDto {
  name: string;
  token_id: string;
  pool_id: string;
  params: {
    slippage?: number;
    minTxSize?: number;
    maxTxSize?: number;
    targetVolume?: number;
    schedule?: string;
    useJito?: boolean;
    jitoTip?: number;
    walletIds?: string[];
  };
}

export interface UpdateCampaignDto {
  name?: string;
  params?: Record<string, unknown>;
}

export interface ExecutionLog {
  id: string;
  job_id: string;
  tx_signature?: string;
  latency_ms?: number;
  result: Record<string, unknown>;
  created_at: string;
}

export const campaignApi = {
  async list(): Promise<Campaign[]> {
    return apiClient.get<Campaign[]>('/v1/campaigns');
  },

  async get(id: string): Promise<Campaign> {
    return apiClient.get<Campaign>(`/v1/campaigns/${id}`);
  },

  async create(data: CreateCampaignDto): Promise<Campaign> {
    return apiClient.post<Campaign>('/v1/campaigns', data);
  },

  async update(id: string, data: UpdateCampaignDto): Promise<Campaign> {
    return apiClient.patch<Campaign>(`/v1/campaigns/${id}`, data);
  },

  async start(id: string): Promise<{ campaign: Campaign; run: CampaignRun }> {
    return apiClient.post<{ campaign: Campaign; run: CampaignRun }>(`/v1/campaigns/${id}/start`);
  },

  async pause(id: string): Promise<{ status: string }> {
    return apiClient.post<{ status: string }>(`/v1/campaigns/${id}/pause`);
  },

  async stop(id: string): Promise<{ status: string }> {
    return apiClient.post<{ status: string }>(`/v1/campaigns/${id}/stop`);
  },

  async getStatus(id: string): Promise<CampaignStatus> {
    return apiClient.get<CampaignStatus>(`/v1/campaigns/${id}/status`);
  },

  async getRuns(id: string): Promise<CampaignRun[]> {
    return apiClient.get<CampaignRun[]>(`/v1/campaigns/${id}/runs`);
  },

  async getLogs(id: string, limit = 100): Promise<ExecutionLog[]> {
    return apiClient.get<ExecutionLog[]>(`/v1/campaigns/${id}/logs?limit=${limit}`);
  },
};

