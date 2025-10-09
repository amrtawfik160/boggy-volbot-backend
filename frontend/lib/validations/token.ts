import { z } from 'zod';
import { solanaAddressSchema } from './solana';

/**
 * Schema for creating a token
 * Mirrors backend CreateTokenDto validation
 */
export const createTokenSchema = z.object({
  mint: solanaAddressSchema,

  symbol: z
    .string()
    .min(1, { message: 'Token symbol is required' })
    .max(50, { message: 'Symbol must not exceed 50 characters' })
    .transform((val) => val.trim().toUpperCase()),

  decimals: z
    .number()
    .int({ message: 'Decimals must be an integer' })
    .min(0, { message: 'Decimals cannot be negative' })
    .max(18, { message: 'Decimals cannot exceed 18' }),

  metadata: z.any().optional(),
});

/**
 * Schema for updating a token
 * Mirrors backend UpdateTokenDto validation
 */
export const updateTokenSchema = z.object({
  symbol: z
    .string()
    .min(1, { message: 'Token symbol must not be empty' })
    .max(50, { message: 'Symbol must not exceed 50 characters' })
    .transform((val) => val.trim().toUpperCase())
    .optional(),

  metadata: z.any().optional(),
});

/**
 * Schema for creating a pool
 * Mirrors backend CreatePoolDto validation
 */
export const createPoolSchema = z.object({
  pool_address: solanaAddressSchema,

  dex: z.enum(['raydium', 'orca', 'jupiter', 'other'], {
    errorMap: () => ({ message: 'DEX must be one of: raydium, orca, jupiter, other' }),
  }),

  metadata: z.any().optional(),
});

// Export types for TypeScript
export type CreateToken = z.infer<typeof createTokenSchema>;
export type UpdateToken = z.infer<typeof updateTokenSchema>;
export type CreatePool = z.infer<typeof createPoolSchema>;
