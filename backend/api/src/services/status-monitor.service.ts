import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';
import { CampaignWebSocketGateway } from '../websocket/websocket.gateway';
import { createLogger } from '../config/logger';

/**
 * StatusMonitorService
 *
 * Monitors campaign_runs table for summary updates and broadcasts
 * them via WebSocket to connected clients.
 *
 * Uses Supabase real-time subscriptions to listen for changes to
 * the campaign_runs.summary field.
 */
@Injectable()
export class StatusMonitorService implements OnModuleInit, OnModuleDestroy {
  private supabase: SupabaseClient;
  private subscription: any;
  private logger = createLogger({ name: 'status-monitor' });

  constructor(private readonly gateway: CampaignWebSocketGateway) {
    this.supabase = supabaseAdmin;
  }

  async onModuleInit() {
    this.logger.info('Initializing real-time subscription');
    this.startMonitoring();
  }

  async onModuleDestroy() {
    this.logger.info('Cleaning up real-time subscription');
    if (this.subscription) {
      await this.supabase.removeChannel(this.subscription);
    }
  }

  /**
   * Start monitoring campaign_runs table for summary updates
   */
  private startMonitoring(): void {
    // Subscribe to UPDATE events on campaign_runs table
    this.subscription = this.supabase
      .channel('campaign_runs_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'campaign_runs',
          filter: 'summary=not.is.null', // Only listen for updates where summary is set
        },
        (payload) => {
          this.handleCampaignRunUpdate(payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.logger.info('Successfully subscribed to campaign_runs updates');
        } else if (status === 'CHANNEL_ERROR') {
          this.logger.error('Channel error, attempting to reconnect');
          // Attempt to restart monitoring after a delay
          setTimeout(() => this.startMonitoring(), 5000);
        } else if (status === 'TIMED_OUT') {
          this.logger.error('Subscription timed out, attempting to reconnect');
          setTimeout(() => this.startMonitoring(), 5000);
        }
      });
  }

  /**
   * Handle campaign run update event from Supabase realtime
   */
  private handleCampaignRunUpdate(payload: any): void {
    try {
      const updatedRun = payload.new;

      if (!updatedRun || !updatedRun.campaign_id || !updatedRun.summary) {
        return;
      }

      const { id: runId, campaign_id: campaignId, status, summary } = updatedRun;

      this.logger.info({ campaignId, runId }, 'Broadcasting status update');

      // Broadcast the update via WebSocket
      this.gateway.emitToCampaign(campaignId, 'campaign:status', {
        runId,
        campaignId,
        status,
        metrics: summary,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error({ error }, 'Error handling campaign run update');
    }
  }

  /**
   * Manually trigger a status broadcast for a specific campaign
   * Useful for on-demand status updates
   */
  async broadcastCampaignStatus(campaignId: string): Promise<void> {
    try {
      // Fetch latest run for the campaign
      const { data: runs, error } = await this.supabase
        .from('campaign_runs')
        .select('id, campaign_id, status, summary')
        .eq('campaign_id', campaignId)
        .order('started_at', { ascending: false })
        .limit(1);

      if (error || !runs || runs.length === 0) {
        this.logger.warn({ campaignId }, 'No runs found for campaign');
        return;
      }

      const run = runs[0];

      if (!run.summary) {
        this.logger.warn({ campaignId, runId: run.id }, 'No summary available for run');
        return;
      }

      // Broadcast the status
      this.gateway.emitToCampaign(campaignId, 'campaign:status', {
        runId: run.id,
        campaignId: run.campaign_id,
        status: run.status,
        metrics: run.summary,
        updatedAt: new Date().toISOString(),
      });

      this.logger.info({ campaignId }, 'Manually broadcasted status');
    } catch (error) {
      this.logger.error({ campaignId, error }, 'Error broadcasting status');
    }
  }
}
