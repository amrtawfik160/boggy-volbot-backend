import { z } from 'zod';
import { solanaAddressSchema, solanaPrivateKeySchema } from './solana';

/**
 * Schema for creating a wallet
 * Mirrors backend CreateWalletDto validation
 * Either address OR privateKey must be provided
 */
export const createWalletSchema = z.object({
  address: solanaAddressSchema.optional(),
  privateKey: solanaPrivateKeySchema.optional(),
  label: z.string().max(255, { message: 'Label must not exceed 255 characters' }).optional(),
}).refine(
  (data) => data.address || data.privateKey,
  {
    message: 'Either address or private key must be provided',
    path: ['address'],
  }
);

/**
 * Schema for updating a wallet
 * Mirrors backend UpdateWalletDto validation
 */
export const updateWalletSchema = z.object({
  label: z.string().max(255, { message: 'Label must not exceed 255 characters' }).optional(),
  is_active: z.boolean().optional(),
});

// Export types for TypeScript
export type CreateWallet = z.infer<typeof createWalletSchema>;
export type UpdateWallet = z.infer<typeof updateWalletSchema>;
