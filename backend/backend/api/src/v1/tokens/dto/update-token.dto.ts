import { IsString, IsOptional } from 'class-validator';

/**
 * DTO for updating an existing token
 */
export class UpdateTokenDto {
  /**
   * Updated token symbol
   */
  @IsOptional()
  @IsString()
  symbol?: string;

  /**
   * Updated metadata (flexible JSONB)
   */
  @IsOptional()
  metadata?: any;
}
