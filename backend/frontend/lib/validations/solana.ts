import { z } from 'zod';

/**
 * Regular expression for validating Solana addresses (Base58, 32-44 characters)
 */
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Regular expression for validating Solana private keys (Base58, 87-88 characters)
 */
const SOLANA_PRIVATE_KEY_REGEX = /^[1-9A-HJ-NP-Za-km-z]{87,88}$/;

/**
 * Zod schema for Solana addresses
 */
export const solanaAddressSchema = z
  .string()
  .regex(SOLANA_ADDRESS_REGEX, {
    message: 'Must be a valid Solana address (base58-encoded, 32-44 characters)',
  })
  .transform((val) => val.trim());

/**
 * Zod schema for Solana private keys
 */
export const solanaPrivateKeySchema = z
  .string()
  .regex(SOLANA_PRIVATE_KEY_REGEX, {
    message: 'Must be a valid Solana private key (base58-encoded, 87-88 characters)',
  })
  .transform((val) => val.trim());

/**
 * Optional Solana address schema (allows empty string)
 */
export const optionalSolanaAddressSchema = z
  .string()
  .optional()
  .refine(
    (val) => !val || SOLANA_ADDRESS_REGEX.test(val),
    {
      message: 'Must be a valid Solana address if provided',
    }
  );

/**
 * Optional Solana private key schema (allows empty string)
 */
export const optionalSolanaPrivateKeySchema = z
  .string()
  .optional()
  .refine(
    (val) => !val || SOLANA_PRIVATE_KEY_REGEX.test(val),
    {
      message: 'Must be a valid Solana private key if provided',
    }
  );
