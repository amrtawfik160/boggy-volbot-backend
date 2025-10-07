import {
  Controller,
  Get,
  UseGuards,
  Query,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard';
import { CurrentUser } from '../../decorators/user.decorator';
import { SupabaseService } from '../../services/supabase.service';

@Controller('dashboard')
@UseGuards(SupabaseAuthGuard)
export class DashboardController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get('metrics')
  async getMetrics(@CurrentUser() user: any) {
    const campaigns = await this.supabase.getCampaignsByUserId(user.id);
    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;

    // Get recent runs for volume and transaction calculations
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Query executions from the last 24 hours
    // This would need to be implemented in SupabaseService
    const executions = await this.supabase.getRecentExecutions(user.id, last24Hours);

    // Calculate metrics
    const totalTransactions = executions.length;
    const successfulTransactions = executions.filter(e => e.result?.success).length;
    const successRate = totalTransactions > 0 ? successfulTransactions / totalTransactions : 0;

    // Calculate 24h volume (sum of all trade amounts)
    const volume24h = executions.reduce((sum, exec) => {
      const amount = exec.result?.amount || 0;
      return sum + amount;
    }, 0);

    // Get recent activity
    const recentActivity = await this.supabase.getRecentActivity(user.id, 20);

    return {
      activeCampaigns,
      volume24h,
      totalTransactions,
      successRate,
      recentActivity: recentActivity.map(activity => ({
        id: activity.id,
        type: activity.action,
        message: activity.metadata?.message || `${activity.action} on ${activity.entity}`,
        timestamp: activity.created_at,
        metadata: activity.metadata,
      })),
    };
  }

  @Get('activity')
  async getActivity(
    @CurrentUser() user: any,
    @Query('limit') limit: string = '20',
  ) {
    const activities = await this.supabase.getRecentActivity(user.id, parseInt(limit));
    return activities.map(activity => ({
      id: activity.id,
      type: activity.action,
      message: activity.metadata?.message || `${activity.action} on ${activity.entity}`,
      timestamp: activity.created_at,
      metadata: activity.metadata,
    }));
  }
}

