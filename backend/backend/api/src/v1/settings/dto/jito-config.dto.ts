import { IsBoolean, IsNumber, IsOptional, IsString, Min, Max, Matches, ValidateIf } from 'class-validator';

/**
 * DTO for Jito configuration
 * Used for validating user_settings.jito_config
 */
export class JitoConfigDto {
  /**
   * Whether to use Jito bundles for transaction execution
   */
  @IsOptional()
  @IsBoolean()
  useJito?: boolean;

  /**
   * Jito authentication keypair (base58 encoded private key)
   * Required when useJito is true
   */
  @ValidateIf((o) => o.useJito === true)
  @IsString()
  @Matches(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/, {
    message: 'jitoKey must be a valid base58 encoded private key (87-88 characters)',
  })
  jitoKey?: string;

  /**
   * Jito block engine URL
   * @default 'https://mainnet.block-engine.jito.wtf'
   */
  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\/.+/, {
    message: 'blockEngineUrl must be a valid URL',
  })
  blockEngineUrl?: string;

  /**
   * Tip amount in SOL for Jito bundles
   * @default 0.0001
   */
  @IsOptional()
  @IsNumber()
  @Min(0.00001, { message: 'jitoFee must be at least 0.00001 SOL' })
  @Max(1, { message: 'jitoFee must not exceed 1 SOL' })
  jitoFee?: number;

  /**
   * Maximum number of transactions per bundle
   * @default 4
   */
  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'bundleTransactionLimit must be at least 1' })
  @Max(5, { message: 'bundleTransactionLimit must not exceed 5' })
  bundleTransactionLimit?: number;

  /**
   * Bundle timeout in milliseconds
   * @default 30000
   */
  @IsOptional()
  @IsNumber()
  @Min(5000, { message: 'bundleTimeoutMs must be at least 5000ms' })
  @Max(60000, { message: 'bundleTimeoutMs must not exceed 60000ms' })
  bundleTimeoutMs?: number;
}
