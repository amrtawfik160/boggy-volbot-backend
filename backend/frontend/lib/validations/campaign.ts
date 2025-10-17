import { z } from 'zod';
import { solanaAddressSchema } from './solana';

/**
 * Schema for campaign parameters
 * Mirrors backend CampaignParamsDto validation
 */
export const campaignParamsSchema = z.object({
  slippage: z
    .number()
    .min(0, { message: 'Slippage must be at least 0%' })
    .max(100, { message: 'Slippage must not exceed 100%' })
    .optional(),

  minTxSize: z
    .number()
    .min(0.00001, { message: 'Min transaction size must be at least 0.00001 SOL' })
    .max(100, { message: 'Min transaction size must not exceed 100 SOL' })
    .optional(),

  maxTxSize: z
    .number()
    .min(0.00001, { message: 'Max transaction size must be at least 0.00001 SOL' })
    .max(1000, { message: 'Max transaction size must not exceed 1000 SOL' })
    .optional(),

  targetVolume: z
    .number()
    .min(0, { message: 'Target volume must be positive' })
    .optional(),

  schedule: z.string().optional(),

  useJito: z.boolean().optional(),

  jitoTip: z
    .number()
    .min(0.00001, { message: 'Jito tip must be at least 0.00001 SOL' })
    .max(1, { message: 'Jito tip must not exceed 1 SOL' })
    .optional(),

  walletIds: z.array(z.string().uuid()).optional(),
}).refine(
  (data) => {
    // Ensure minTxSize <= maxTxSize if both are provided
    if (data.minTxSize && data.maxTxSize) {
      return data.minTxSize <= data.maxTxSize;
    }
    return true;
  },
  {
    message: 'Min transaction size must be less than or equal to max transaction size',
    path: ['maxTxSize'],
  }
);

/**
 * Schema for creating a campaign
 * Mirrors backend CreateCampaignDto validation
 */
export const createCampaignSchema = z.object({
  name: z
    .string()
    .min(1, { message: 'Campaign name is required' })
    .max(255, { message: 'Campaign name must not exceed 255 characters' })
    .transform((val) => val.trim()),

  token_id: z.string().uuid({ message: 'Invalid token ID' }),

  pool_id: solanaAddressSchema,

  params: campaignParamsSchema.optional(),
});

/**
 * Schema for updating a campaign
 * Mirrors backend UpdateCampaignDto validation
 */
export const updateCampaignSchema = z.object({
  name: z
    .string()
    .min(1, { message: 'Campaign name must not be empty' })
    .max(255, { message: 'Campaign name must not exceed 255 characters' })
    .transform((val) => val.trim())
    .optional(),

  params: campaignParamsSchema.optional(),
});

/**
 * Schema for distribute operation
 * Mirrors backend DistributeDto validation
 */
export const distributeSchema = z.object({
  num_wallets: z
    .number()
    .int({ message: 'Number of wallets must be an integer' })
    .min(1, { message: 'Must distribute to at least 1 wallet' })
    .max(100, { message: 'Cannot distribute to more than 100 wallets' })
    .optional(),
});

/**
 * Schema for sell-only operation
 * Mirrors backend SellOnlyDto validation
 */
export const sellOnlySchema = z.object({
  total_times: z
    .number()
    .int({ message: 'Total times must be an integer' })
    .min(1, { message: 'Total times must be at least 1' })
    .max(20, { message: 'Total times must not exceed 20' })
    .optional(),
});

// Export types for TypeScript
export type CampaignParams = z.infer<typeof campaignParamsSchema>;
export type CreateCampaign = z.infer<typeof createCampaignSchema>;
export type UpdateCampaign = z.infer<typeof updateCampaignSchema>;
export type Distribute = z.infer<typeof distributeSchema>;
export type SellOnly = z.infer<typeof sellOnlySchema>;
