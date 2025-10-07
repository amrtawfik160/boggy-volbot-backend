import { Module } from '@nestjs/common';
import { CampaignWebSocketGateway } from './websocket.gateway';
import { SupabaseService } from '../services/supabase.service';

@Module({
  providers: [CampaignWebSocketGateway, SupabaseService],
  exports: [CampaignWebSocketGateway],
})
export class WebSocketModule {}
