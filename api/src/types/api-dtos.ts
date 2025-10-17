import type { UUID, Json } from './primitives';

// Auth
export interface MeResponse {
  id: UUID;
  email: string;
  role: 'user' | 'admin';
}

// Tokens
export interface CreateTokenRequest { mint: string; symbol?: string; }
export interface TokenResponse { id: UUID; mint: string; symbol: string; decimals: number; }

// Pools
export interface PoolsQuery { mint: string; }
export interface PoolResponse { id: UUID; pool_address: string; dex: string }

// Wallets
export interface CreateWalletRequest { address: string; label?: string; encrypted_private_key?: string | null }
export interface WalletResponse { id: UUID; address: string; label?: string | null; is_active: boolean }

// Campaigns
export interface CreateCampaignRequest {
  name: string;
  token_id: UUID;
  pool_id: UUID;
  params: Json;
}
export interface CampaignResponse { id: UUID; name: string; status: string; }

// Runs
export interface RunActionResponse { ok: true }

// Status & Logs
export interface CampaignStatusResponse {
  id: UUID;
  status: string;
  stats: Json;
}
export interface LogEntry { ts: string; level: string; msg: string; meta?: Json }
export interface LogsResponse { items: LogEntry[]; next?: string | null }

// Webhooks
export interface CreateWebhookRequest { url: string; events: string[]; secret?: string }
export interface WebhookResponse { id: UUID; url: string; is_active: boolean }

