import { IsString, IsOptional, ValidateIf } from 'class-validator';
import { IsSolanaAddress, IsSolanaPrivateKey } from '../../../common/validators';

/**
 * DTO for creating a new wallet
 * Either address (read-only) or privateKey (with trading capabilities) must be provided
 */
export class CreateWalletDto {
  /**
   * Solana wallet address (for read-only wallets)
   * Required if privateKey is not provided
   */
  @ValidateIf((o) => !o.privateKey)
  @IsSolanaAddress()
  address?: string;

  /**
   * Base58-encoded Solana private key (64 bytes)
   * Required if address is not provided
   * Will be encrypted before storage
   */
  @ValidateIf((o) => !o.address)
  @IsSolanaPrivateKey()
  privateKey?: string;

  /**
   * Optional label for the wallet
   */
  @IsOptional()
  @IsString()
  label?: string;
}
