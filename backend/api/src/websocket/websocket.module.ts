import { Module } from '@nestjs/common';
import { CampaignWebSocketGateway } from './websocket.gateway';

@Module({
  providers: [CampaignWebSocketGateway],
  exports: [CampaignWebSocketGateway],
})
export class WebSocketModule {}
