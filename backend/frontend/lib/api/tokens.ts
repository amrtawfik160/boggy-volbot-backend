import { apiClient } from './client';

export interface Token {
  id: string;
  mint: string;
  symbol: string;
  decimals: number;
  metadata?: {
    name?: string;
    image?: string;
    description?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface Pool {
  id: string;
  token_id: string;
  pool_address: string;
  dex: string;
  metadata?: {
    liquidity?: number;
    volume24h?: number;
  };
  created_at: string;
  updated_at: string;
}

export interface CreateTokenDto {
  mint: string;
  symbol: string;
  decimals: number;
  metadata?: {
    name?: string;
    image?: string;
    description?: string;
  };
}

export interface UpdateTokenDto {
  symbol?: string;
  metadata?: Record<string, unknown>;
}

export const tokenApi = {
  async list(): Promise<Token[]> {
    return apiClient.get<Token[]>('/v1/tokens');
  },

  async get(id: string): Promise<Token> {
    return apiClient.get<Token>(`/v1/tokens/${id}`);
  },

  async create(data: CreateTokenDto): Promise<Token> {
    return apiClient.post<Token>('/v1/tokens', data);
  },

  async update(id: string, data: UpdateTokenDto): Promise<Token> {
    return apiClient.patch<Token>(`/v1/tokens/${id}`, data);
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/v1/tokens/${id}`);
  },

  async fetchMetadata(mint: string): Promise<{ symbol: string; decimals: number; name?: string; image?: string }> {
    return apiClient.get<{ symbol: string; decimals: number; name?: string; image?: string }>(`/v1/tokens/metadata/${mint}`);
  },

  async discoverPools(tokenId: string): Promise<Pool[]> {
    return apiClient.get<Pool[]>(`/v1/tokens/${tokenId}/pools`);
  },
};

