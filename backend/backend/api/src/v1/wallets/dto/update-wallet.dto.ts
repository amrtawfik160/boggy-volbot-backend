import { IsString, IsOptional, IsBoolean } from 'class-validator';

/**
 * DTO for updating an existing wallet
 */
export class UpdateWalletDto {
  /**
   * Updated label for the wallet
   */
  @IsOptional()
  @IsString()
  label?: string;

  /**
   * Whether the wallet is active for trading
   */
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
