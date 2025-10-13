import { Module } from '@nestjs/common'
import { AdminMetricsController } from './metrics/metrics.controller'
import { MetricsService } from '../../services/metrics.service'
import { SupabaseService } from '../../services/supabase.service'

@Module({
    controllers: [AdminMetricsController],
    providers: [MetricsService, SupabaseService],
})
export class AdminModule {}
