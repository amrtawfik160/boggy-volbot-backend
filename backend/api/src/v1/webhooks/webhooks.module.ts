import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { SupabaseService } from '../../services/supabase.service';

@Module({
  controllers: [WebhooksController],
  providers: [SupabaseService],
})
export class WebhooksModule {}
