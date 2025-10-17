import { IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JitoConfigDto } from './jito-config.dto';

/**
 * DTO for updating user settings
 */
export class UpdateSettingsDto {
  /**
   * Trading configuration (flexible JSONB)
   * e.g., { isRandom, buyLowerAmount, buyUpperAmount, buyIntervalMin, buyIntervalMax }
   */
  @IsOptional()
  trading_config?: any;

  /**
   * Sell configuration (flexible JSONB)
   * e.g., { percent: 100, sellAllByTimes: 20 }
   */
  @IsOptional()
  sell_config?: any;

  /**
   * Jito configuration with validation
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => JitoConfigDto)
  jito_config?: JitoConfigDto;
}
