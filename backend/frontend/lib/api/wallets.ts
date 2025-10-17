import { apiClient } from './client';

export interface Wallet {
  id: string;
  user_id: string;
  address: string;
  label?: string;
  is_active: boolean;
  balance?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateWalletDto {
  address?: string;
  privateKey?: string;
  label?: string;
}

export interface UpdateWalletDto {
  label?: string;
  is_active?: boolean;
}

export const walletApi = {
  async list(): Promise<Wallet[]> {
    return apiClient.get<Wallet[]>('/v1/wallets');
  },

  async get(id: string): Promise<Wallet> {
    return apiClient.get<Wallet>(`/v1/wallets/${id}`);
  },

  async create(data: CreateWalletDto): Promise<Wallet> {
    return apiClient.post<Wallet>('/v1/wallets', data);
  },

  async update(id: string, data: UpdateWalletDto): Promise<Wallet> {
    return apiClient.patch<Wallet>(`/v1/wallets/${id}`, data);
  },

  async delete(id: string): Promise<void> {
    return apiClient.delete<void>(`/v1/wallets/${id}`);
  },

  async getBalance(address: string): Promise<{ sol: number; tokens: Record<string, number> }> {
    // This will be implemented when we add balance checking endpoint
    return apiClient.get<{ sol: number; tokens: Record<string, number> }>(`/v1/wallets/balance/${address}`);
  },
};

