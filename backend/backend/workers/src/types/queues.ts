export const QueueNames = {
  GATHER: 'gather',
  TRADE_BUY: 'trade.buy',
  TRADE_SELL: 'trade.sell',
  DISTRIBUTE: 'distribute',
  STATUS: 'status',
  WEBHOOK: 'webhook',
  FUNDS_GATHER: 'funds.gather',
} as const;

export type QueueName = typeof QueueNames[keyof typeof QueueNames];

export interface GatherJobPayload {
  campaign_id: string;
}

export interface TradeJobPayload {
  run_id: string;
  wallet_id: string;
  base_mint: string;
  pool_id?: string | null;
  amount?: number;
  use_jito?: boolean;
}

export interface DistributeJobPayload {
  run_id: string;
  num_wallets: number;
}

export interface StatusJobPayload {
  campaign_id: string;
}

export interface WebhookJobPayload {
  event: string;
  payload: unknown;
}

export interface FundsGatherJobPayload {
  campaign_id: string;
  target_wallet_id?: string;
}

