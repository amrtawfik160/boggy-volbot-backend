import { IsString, IsOptional, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsSolanaAddress, IsSolanaPrivateKey } from '../../../common/validators';

/**
 * DTO for creating a new wallet
 * Either address (read-only) or privateKey (with trading capabilities) must be provided
 */
export class CreateWalletDto {
  @ApiPropertyOptional({ description: 'Solana wallet address (for read-only wallets). Required if privateKey is not provided.', example: 'GKvqsuNcnwWqPzzuhLmGi4rzzh55FhJtGizkhHaEJqiV' })
  @ValidateIf((o) => !o.privateKey)
  @IsSolanaAddress()
  address?: string;

  @ApiPropertyOptional({ description: 'Base58-encoded Solana private key (64 bytes). Required if address is not provided. Will be encrypted before storage.', example: '5J...' })
  @ValidateIf((o) => !o.address)
  @IsSolanaPrivateKey()
  privateKey?: string;

  @ApiPropertyOptional({ description: 'Optional label for the wallet', example: 'Trading Wallet 1' })
  @IsOptional()
  @IsString()
  label?: string;
}
