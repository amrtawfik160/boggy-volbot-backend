import { IsString, IsNotEmpty, IsUUID, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignParamsDto } from './campaign-params.dto';
import { IsSolanaAddress } from '../../../common/validators';

/**
 * DTO for creating a new campaign
 */
export class CreateCampaignDto {
  /**
   * Human-readable name for the campaign
   */
  @IsString()
  @IsNotEmpty({ message: 'Campaign name is required' })
  name: string;

  /**
   * Token ID from the tokens table
   */
  @IsUUID('4', { message: 'Token ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Token ID is required' })
  token_id: string;

  /**
   * Solana pool address
   */
  @IsSolanaAddress()
  @IsNotEmpty({ message: 'Pool ID is required' })
  pool_id: string;

  /**
   * Campaign parameters with validation
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignParamsDto)
  params?: CampaignParamsDto;
}
