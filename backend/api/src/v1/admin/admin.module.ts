import { Module } from '@nestjs/common'
import { AdminMetricsController } from './metrics/metrics.controller'
import { CampaignsController } from './campaigns/campaigns.controller'
import { UsersController } from './users/users.controller'
import { SystemControlController } from './system/system-control.controller'
import { MetricsService } from '../../services/metrics.service'
import { SupabaseService } from '../../services/supabase.service'
import { SystemControlService } from '../../services/system-control.service'
import { OverrideService } from '../../services/override.service'

@Module({
    controllers: [AdminMetricsController, CampaignsController, UsersController, SystemControlController],
    providers: [MetricsService, SupabaseService, SystemControlService, OverrideService],
})
export class AdminModule {}
