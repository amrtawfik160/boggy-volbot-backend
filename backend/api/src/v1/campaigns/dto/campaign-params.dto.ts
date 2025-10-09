import { IsNumber, IsOptional, IsBoolean, IsString, Min, Max } from 'class-validator';

/**
 * DTO for campaign parameters
 * Validates slippage, transaction sizes, and other campaign-specific settings
 */
export class CampaignParamsDto {
  /**
   * Slippage tolerance as a percentage (0-100)
   * @example 1 = 1% slippage tolerance
   */
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Slippage must be at least 0%' })
  @Max(100, { message: 'Slippage must not exceed 100%' })
  slippage?: number;

  /**
   * Minimum transaction size in SOL
   * @example 0.001 = 0.001 SOL minimum
   */
  @IsOptional()
  @IsNumber()
  @Min(0.00001, { message: 'Min transaction size must be at least 0.00001 SOL' })
  @Max(100, { message: 'Min transaction size must not exceed 100 SOL' })
  minTxSize?: number;

  /**
   * Maximum transaction size in SOL
   * @example 0.01 = 0.01 SOL maximum
   */
  @IsOptional()
  @IsNumber()
  @Min(0.00001, { message: 'Max transaction size must be at least 0.00001 SOL' })
  @Max(1000, { message: 'Max transaction size must not exceed 1000 SOL' })
  maxTxSize?: number;

  /**
   * Target volume in USD (optional)
   */
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Target volume must be positive' })
  targetVolume?: number;

  /**
   * Cron schedule string (optional)
   * @example "0 * * * *" = hourly
   */
  @IsOptional()
  @IsString()
  schedule?: string;

  /**
   * Whether to use Jito bundles for transactions
   */
  @IsOptional()
  @IsBoolean()
  useJito?: boolean;

  /**
   * Jito tip amount in SOL
   */
  @IsOptional()
  @IsNumber()
  @Min(0.00001, { message: 'Jito tip must be at least 0.00001 SOL' })
  @Max(1, { message: 'Jito tip must not exceed 1 SOL' })
  jitoTip?: number;
}
