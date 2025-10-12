import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
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
import { StatusMonitorService } from './services/status-monitor.service'
import { WebSocketModule } from './websocket/websocket.module'
import { RedisThrottlerStorage } from './throttler/redis-throttler-storage'
import { GeneralThrottlerGuard } from './guards/general-throttler.guard'

@Module({
    imports: [
        WebSocketModule,
        ThrottlerModule.forRoot({
            throttlers: [
                {
                    name: 'general',
                    ttl: 60000, // 60 seconds
                    limit: 100, // 100 requests per minute per user
                },
                {
                    name: 'campaign-start',
                    ttl: 60000, // 60 seconds
                    limit: 5, // 5 requests per minute for campaign start
                },
                {
                    name: 'wallet-creation',
                    ttl: 60000, // 60 seconds
                    limit: 10, // 10 requests per minute for wallet creation
                },
            ],
            storage: new RedisThrottlerStorage(),
        }),
    ],
    controllers: [HealthController, MeController, TokensController, WalletsController, CampaignsController, DashboardController, SettingsController],
    providers: [
        SupabaseService,
        EncryptionService,
        KeyManagementService,
        TransactionSigningService,
        KeyRotationService,
        StatusMonitorService,
        {
            provide: APP_GUARD,
            useClass: GeneralThrottlerGuard,
        },
    ],
})
export class AppModule {}
