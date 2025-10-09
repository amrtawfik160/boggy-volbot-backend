import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';
import { CampaignWebSocketGateway } from '../websocket/websocket.gateway';

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

  constructor(private readonly gateway: CampaignWebSocketGateway) {
    this.supabase = supabaseAdmin;
  }

  async onModuleInit() {
    console.log('[StatusMonitor] Initializing real-time subscription...');
    this.startMonitoring();
  }

  async onModuleDestroy() {
    console.log('[StatusMonitor] Cleaning up real-time subscription...');
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
          console.log('[StatusMonitor] Successfully subscribed to campaign_runs updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[StatusMonitor] Channel error, attempting to reconnect...');
          // Attempt to restart monitoring after a delay
          setTimeout(() => this.startMonitoring(), 5000);
        } else if (status === 'TIMED_OUT') {
          console.error('[StatusMonitor] Subscription timed out, attempting to reconnect...');
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

      console.log(`[StatusMonitor] Broadcasting status update for campaign ${campaignId} (run: ${runId})`);

      // Broadcast the update via WebSocket
      this.gateway.emitToCampaign(campaignId, 'campaign:status', {
        runId,
        campaignId,
        status,
        metrics: summary,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[StatusMonitor] Error handling campaign run update:', error);
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
        console.warn(`[StatusMonitor] No runs found for campaign ${campaignId}`);
        return;
      }

      const run = runs[0];

      if (!run.summary) {
        console.warn(`[StatusMonitor] No summary available for run ${run.id}`);
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

      console.log(`[StatusMonitor] Manually broadcasted status for campaign ${campaignId}`);
    } catch (error) {
      console.error(`[StatusMonitor] Error broadcasting status for campaign ${campaignId}:`, error);
    }
  }
}
