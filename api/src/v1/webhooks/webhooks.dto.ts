import { IsString, IsArray, IsUrl, IsUUID, IsEnum, IsOptional } from 'class-validator';

export class CreateWebhookDto {
  @IsUrl()
  url!: string;

  @IsArray()
  @IsString({ each: true })
  events!: string[];

  @IsString()
  secret!: string;
}

export class UpdateWebhookDto {
  @IsUrl()
  @IsOptional()
  url?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  events?: string[];

  @IsString()
  @IsOptional()
  secret?: string;
}

export class TestWebhookDto {
  @IsUUID()
  webhookId!: string;

  @IsString()
  @IsOptional()
  event?: string;
}

export class WebhookDeliveryQueryDto {
  @IsEnum(['pending', 'success', 'failed', 'retrying'])
  @IsOptional()
  status?: 'pending' | 'success' | 'failed' | 'retrying';

  @IsString()
  @IsOptional()
  event?: string;

  @IsOptional()
  limit?: number = 50;

  @IsOptional()
  offset?: number = 0;
}
