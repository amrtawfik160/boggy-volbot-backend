import { Module } from '@nestjs/common'
import { HealthController } from './health/health.controller'
import { MeController } from './v1/me/me.controller'
import { TokensController } from './v1/tokens/tokens.controller'
import { WalletsController } from './v1/wallets/wallets.controller'
import { CampaignsController } from './v1/campaigns/campaigns.controller'
import { DashboardController } from './v1/dashboard/dashboard.controller'
import { SettingsController } from './v1/settings/settings.controller'
import { SupabaseService } from './services/supabase.service'
import { EncryptionService } from './services/encryption.service'
import { KeyManagementService } from './services/key-management.service'
import { TransactionSigningService } from './services/transaction-signing.service'
import { KeyRotationService } from './services/key-rotation.service'
import { WebSocketModule } from './websocket/websocket.module'

@Module({
    imports: [WebSocketModule],
    controllers: [HealthController, MeController, TokensController, WalletsController, CampaignsController, DashboardController, SettingsController],
    providers: [SupabaseService, EncryptionService, KeyManagementService, TransactionSigningService, KeyRotationService],
})
export class AppModule {}
