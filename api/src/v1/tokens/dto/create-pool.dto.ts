import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { IsSolanaAddress } from '../../../common/validators';

/**
 * DTO for creating a new pool
 */
export class CreatePoolDto {
  /**
   * Pool address on Solana
   */
  @IsSolanaAddress()
  @IsNotEmpty({ message: 'Pool address is required' })
  pool_address!: string;

  /**
   * DEX name (e.g., "raydium", "orca", "jupiter")
   */
  @IsString()
  @IsNotEmpty({ message: 'DEX name is required' })
  @IsIn(['raydium', 'orca', 'jupiter', 'other'], {
    message: 'DEX must be one of: raydium, orca, jupiter, other',
  })
  dex!: string;

  /**
   * Optional pool metadata (flexible JSONB)
   */
  @IsOptional()
  metadata?: any;
}
