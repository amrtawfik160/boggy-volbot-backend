import { IsString, IsNotEmpty, IsNumber, IsInt, Min, Max, IsOptional } from 'class-validator';
import { IsSolanaAddress } from '../../../common/validators';

/**
 * DTO for creating a new token
 */
export class CreateTokenDto {
  /**
   * Token mint address
   */
  @IsSolanaAddress()
  @IsNotEmpty({ message: 'Mint address is required' })
  mint: string;

  /**
   * Token symbol (e.g., "SOL", "USDC")
   */
  @IsString()
  @IsNotEmpty({ message: 'Token symbol is required' })
  symbol: string;

  /**
   * Token decimals (typically 6-9 for SPL tokens)
   */
  @IsNumber()
  @IsInt({ message: 'Decimals must be an integer' })
  @Min(0, { message: 'Decimals cannot be negative' })
  @Max(18, { message: 'Decimals cannot exceed 18' })
  decimals: number;

  /**
   * Optional metadata (flexible JSONB)
   */
  @IsOptional()
  metadata?: any;
}
