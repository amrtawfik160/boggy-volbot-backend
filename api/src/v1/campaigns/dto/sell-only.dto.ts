import { IsNumber, IsOptional, Min, Max, IsInt } from 'class-validator';

/**
 * DTO for sell-only operations
 */
export class SellOnlyDto {
  /**
   * Number of times to execute sell operation
   * @default 1
   */
  @IsOptional()
  @IsNumber()
  @IsInt({ message: 'Total times must be an integer' })
  @Min(1, { message: 'Total times must be at least 1' })
  @Max(20, { message: 'Total times must not exceed 20' })
  total_times?: number;
}
