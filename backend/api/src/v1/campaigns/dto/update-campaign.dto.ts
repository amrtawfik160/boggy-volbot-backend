import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CampaignParamsDto } from './campaign-params.dto';

/**
 * DTO for updating an existing campaign
 */
export class UpdateCampaignDto {
  /**
   * Updated campaign name
   */
  @IsOptional()
  @IsString()
  name?: string;

  /**
   * Updated campaign parameters
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignParamsDto)
  params?: CampaignParamsDto;
}
