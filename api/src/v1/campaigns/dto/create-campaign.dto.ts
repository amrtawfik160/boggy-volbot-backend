import { IsString, IsNotEmpty, IsUUID, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CampaignParamsDto } from './campaign-params.dto';
import { IsSolanaAddress } from '../../../common/validators';

/**
 * DTO for creating a new campaign
 */
export class CreateCampaignDto {
  @ApiProperty({ description: 'Human-readable name for the campaign', example: 'My Volume Campaign' })
  @IsString()
  @IsNotEmpty({ message: 'Campaign name is required' })
  name: string;

  @ApiProperty({ description: 'Token ID from the tokens table', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID('4', { message: 'Token ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Token ID is required' })
  token_id: string;

  @ApiProperty({ description: 'Solana pool address', example: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2' })
  @IsSolanaAddress()
  @IsNotEmpty({ message: 'Pool ID is required' })
  pool_id: string;

  @ApiPropertyOptional({ description: 'Campaign parameters with validation', type: CampaignParamsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignParamsDto)
  params?: CampaignParamsDto;
}
