import { IsNumber, IsOptional, Min, Max, IsInt } from 'class-validator';

/**
 * DTO for distributing funds to wallets
 */
export class DistributeDto {
  /**
   * Number of wallets to distribute funds to
   * @default 5
   */
  @IsOptional()
  @IsNumber()
  @IsInt({ message: 'Number of wallets must be an integer' })
  @Min(1, { message: 'Must distribute to at least 1 wallet' })
  @Max(100, { message: 'Cannot distribute to more than 100 wallets' })
  num_wallets?: number;
}
