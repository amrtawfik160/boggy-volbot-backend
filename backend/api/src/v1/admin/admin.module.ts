import { Module } from '@nestjs/common'
import { AdminMetricsController } from './metrics/metrics.controller'
import { CampaignsController } from './campaigns/campaigns.controller'
import { UsersController } from './users/users.controller'
import { MetricsService } from '../../services/metrics.service'
import { SupabaseService } from '../../services/supabase.service'

@Module({
    controllers: [AdminMetricsController, CampaignsController, UsersController],
    providers: [MetricsService, SupabaseService],
})
export class AdminModule {}
