import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { campaignApi, type Campaign, type CampaignRun, type CampaignStatus, type CreateCampaignDto, type ExecutionLog, type UpdateCampaignDto } from './campaigns';
import { dashboardApi, type ActivityItem, type DashboardMetrics } from './dashboard';
import { tokenApi, type CreateTokenDto, type Pool, type Token, type UpdateTokenDto } from './tokens';
import { walletApi, type CreateWalletDto, type UpdateWalletDto, type Wallet } from './wallets';

// Query Keys
export const queryKeys = {
  // Dashboard
  dashboardMetrics: ['dashboard', 'metrics'] as const,
  dashboardActivity: (limit?: number) => ['dashboard', 'activity', limit] as const,

  // Campaigns
  campaigns: ['campaigns'] as const,
  campaign: (id: string) => ['campaigns', id] as const,
  campaignStatus: (id: string) => ['campaigns', id, 'status'] as const,
  campaignRuns: (id: string) => ['campaigns', id, 'runs'] as const,
  campaignLogs: (id: string, limit?: number) => ['campaigns', id, 'logs', limit] as const,

  // Tokens
  tokens: ['tokens'] as const,
  token: (id: string) => ['tokens', id] as const,
  tokenPools: (id: string) => ['tokens', id, 'pools'] as const,
  tokenMetadata: (mint: string) => ['tokens', 'metadata', mint] as const,

  // Wallets
  wallets: ['wallets'] as const,
  wallet: (id: string) => ['wallets', id] as const,
  walletBalance: (address: string) => ['wallets', 'balance', address] as const,
};

// ============================================
// Dashboard Hooks
// ============================================

export function useDashboardMetrics(
  options?: Omit<UseQueryOptions<DashboardMetrics>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.dashboardMetrics,
    queryFn: () => dashboardApi.getMetrics(),
    ...options,
  });
}

export function useDashboardActivity(
  limit = 20,
  options?: Omit<UseQueryOptions<ActivityItem[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.dashboardActivity(limit),
    queryFn: () => dashboardApi.getActivity(limit),
    ...options,
  });
}

// ============================================
// Campaign Hooks
// ============================================

export function useCampaigns(
  options?: Omit<UseQueryOptions<Campaign[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.campaigns,
    queryFn: () => campaignApi.list(),
    ...options,
  });
}

export function useCampaign(
  id: string,
  options?: Omit<UseQueryOptions<Campaign>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.campaign(id),
    queryFn: () => campaignApi.get(id),
    enabled: !!id,
    ...options,
  });
}

export function useCampaignStatus(
  id: string,
  options?: Omit<UseQueryOptions<CampaignStatus>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.campaignStatus(id),
    queryFn: () => campaignApi.getStatus(id),
    enabled: !!id,
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
    ...options,
  });
}

export function useCampaignRuns(
  id: string,
  options?: Omit<UseQueryOptions<CampaignRun[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.campaignRuns(id),
    queryFn: () => campaignApi.getRuns(id),
    enabled: !!id,
    ...options,
  });
}

export function useCampaignLogs(
  id: string,
  limit = 100,
  options?: Omit<UseQueryOptions<ExecutionLog[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.campaignLogs(id, limit),
    queryFn: () => campaignApi.getLogs(id, limit),
    enabled: !!id,
    ...options,
  });
}

export function useCreateCampaign(
  options?: UseMutationOptions<Campaign, Error, CreateCampaignDto>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCampaignDto) => campaignApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns });
      toast.success('Campaign created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create campaign');
    },
    ...options,
  });
}

export function useUpdateCampaign(
  options?: UseMutationOptions<Campaign, Error, { id: string; data: UpdateCampaignDto }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCampaignDto }) =>
      campaignApi.update(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaign(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns });
      toast.success('Campaign updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update campaign');
    },
    ...options,
  });
}

export function useStartCampaign(
  options?: UseMutationOptions<{ campaign: Campaign; run: CampaignRun }, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => campaignApi.start(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaign(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaignStatus(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns });
      toast.success('Campaign started successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start campaign');
    },
    ...options,
  });
}

export function usePauseCampaign(
  options?: UseMutationOptions<{ status: string }, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => campaignApi.pause(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaign(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaignStatus(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns });
      toast.success('Campaign paused successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to pause campaign');
    },
    ...options,
  });
}

export function useStopCampaign(
  options?: UseMutationOptions<{ status: string }, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => campaignApi.stop(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaign(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaignStatus(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns });
      toast.success('Campaign stopped successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to stop campaign');
    },
    ...options,
  });
}

// ============================================
// Token Hooks
// ============================================

export function useTokens(
  options?: Omit<UseQueryOptions<Token[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.tokens,
    queryFn: () => tokenApi.list(),
    ...options,
  });
}

export function useToken(
  id: string,
  options?: Omit<UseQueryOptions<Token>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.token(id),
    queryFn: () => tokenApi.get(id),
    enabled: !!id,
    ...options,
  });
}

export function useTokenPools(
  tokenId: string,
  options?: Omit<UseQueryOptions<Pool[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.tokenPools(tokenId),
    queryFn: () => tokenApi.discoverPools(tokenId),
    enabled: !!tokenId,
    ...options,
  });
}

export function useTokenMetadata(
  mint: string,
  options?: Omit<UseQueryOptions<{ symbol: string; decimals: number; name?: string; image?: string }>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.tokenMetadata(mint),
    queryFn: () => tokenApi.fetchMetadata(mint),
    enabled: !!mint,
    ...options,
  });
}

export function useCreateToken(
  options?: UseMutationOptions<Token, Error, CreateTokenDto>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTokenDto) => tokenApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tokens });
      toast.success('Token created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create token');
    },
    ...options,
  });
}

export function useUpdateToken(
  options?: UseMutationOptions<Token, Error, { id: string; data: UpdateTokenDto }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTokenDto }) =>
      tokenApi.update(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.token(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tokens });
      toast.success('Token updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update token');
    },
    ...options,
  });
}

export function useDeleteToken(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => tokenApi.delete(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tokens });
      queryClient.removeQueries({ queryKey: queryKeys.token(id) });
      toast.success('Token deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete token');
    },
    ...options,
  });
}

// ============================================
// Wallet Hooks
// ============================================

export function useWallets(
  options?: Omit<UseQueryOptions<Wallet[]>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.wallets,
    queryFn: () => walletApi.list(),
    ...options,
  });
}

export function useWallet(
  id: string,
  options?: Omit<UseQueryOptions<Wallet>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.wallet(id),
    queryFn: () => walletApi.get(id),
    enabled: !!id,
    ...options,
  });
}

export function useWalletBalance(
  address: string,
  options?: Omit<UseQueryOptions<{ sol: number; tokens: Record<string, number> }>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.walletBalance(address),
    queryFn: () => walletApi.getBalance(address),
    enabled: !!address,
    ...options,
  });
}

export function useCreateWallet(
  options?: UseMutationOptions<Wallet, Error, CreateWalletDto>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateWalletDto) => walletApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wallets });
      toast.success('Wallet created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create wallet');
    },
    ...options,
  });
}

export function useUpdateWallet(
  options?: UseMutationOptions<Wallet, Error, { id: string; data: UpdateWalletDto }>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWalletDto }) =>
      walletApi.update(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wallet(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.wallets });
      toast.success('Wallet updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update wallet');
    },
    ...options,
  });
}

export function useDeleteWallet(
  options?: UseMutationOptions<void, Error, string>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => walletApi.delete(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wallets });
      queryClient.removeQueries({ queryKey: queryKeys.wallet(id) });
      toast.success('Wallet deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete wallet');
    },
    ...options,
  });
}
