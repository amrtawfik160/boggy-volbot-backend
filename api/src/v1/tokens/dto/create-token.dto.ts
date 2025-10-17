import { IsString, IsNotEmpty, IsNumber, IsInt, Min, Max, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsSolanaAddress } from '../../../common/validators';

/**
 * DTO for creating a new token
 */
export class CreateTokenDto {
  @ApiProperty({ description: 'Token mint address', example: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' })
  @IsSolanaAddress()
  @IsNotEmpty({ message: 'Mint address is required' })
  mint: string;

  @ApiProperty({ description: 'Token symbol', example: 'USDC' })
  @IsString()
  @IsNotEmpty({ message: 'Token symbol is required' })
  symbol: string;

  @ApiProperty({ description: 'Token decimals (typically 6-9 for SPL tokens)', example: 6, minimum: 0, maximum: 18 })
  @IsNumber()
  @IsInt({ message: 'Decimals must be an integer' })
  @Min(0, { message: 'Decimals cannot be negative' })
  @Max(18, { message: 'Decimals cannot exceed 18' })
  decimals: number;

  @ApiPropertyOptional({ description: 'Optional metadata (flexible JSONB)', example: { name: 'USD Coin', logo: 'https://...' } })
  @IsOptional()
  metadata?: any;
}
