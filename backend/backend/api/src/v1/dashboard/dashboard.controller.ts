import {
  Controller,
  Get,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard';
import { CurrentUser } from '../../decorators/user.decorator';
import { SupabaseService } from '../../services/supabase.service';
import { PaginationDto, createPaginationMeta } from '../../common/pagination.dto';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@Controller('dashboard')
@UseGuards(SupabaseAuthGuard)
export class DashboardController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get dashboard metrics', description: 'Get dashboard overview metrics including active campaigns, 24h volume, transactions, and recent activity' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
  @ApiOperation({ summary: 'Get user activity', description: 'Get paginated list of user activity events' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20, max: 100)' })
  @ApiResponse({ status: 200, description: 'Activity retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getActivity(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
  ) {
    const page = pagination.page || 1;
    const limit = Math.min(pagination.limit || 20, 100);

    // Get more activities than needed to calculate total
    const allActivities = await this.supabase.getRecentActivity(user.id, 1000);

    // Paginate in-memory
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedActivities = allActivities.slice(startIndex, endIndex);

    return {
      data: paginatedActivities.map(activity => ({
        id: activity.id,
        type: activity.action,
        message: activity.metadata?.message || `${activity.action} on ${activity.entity}`,
        timestamp: activity.created_at,
        metadata: activity.metadata,
      })),
      pagination: createPaginationMeta(page, limit, allActivities.length),
    };
  }
}

