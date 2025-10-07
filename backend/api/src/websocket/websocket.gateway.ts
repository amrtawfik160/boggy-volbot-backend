import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { supabaseAdmin } from '../config/supabase';
import { User } from '@supabase/supabase-js';
import { SupabaseService } from '../services/supabase.service';

// Extend Socket interface to include authenticated user
interface AuthenticatedSocket extends Socket {
  user?: User;
}

interface JoinCampaignPayload {
  campaignId: string;
}

interface LeaveCampaignPayload {
  campaignId: string;
}

interface GetSubscriptionsPayload {
  // Empty payload - just requests current subscriptions
}

interface GetMissedEventsPayload {
  campaignId: string;
  since?: string; // ISO timestamp - get events after this time
  limit?: number; // Max number of events to return
}

// Event payload interfaces with event ID for tracking
interface BaseEventPayload {
  eventId: string; // Unique event identifier
  timestamp: string;
}

// Event payload interfaces
export interface JobStatusPayload extends BaseEventPayload {
  jobId: string;
  runId: string;
  campaignId: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  queue: string;
  type: string;
  attempts?: number;
  error?: any;
}

export interface RunStatusPayload extends BaseEventPayload {
  runId: string;
  campaignId: string;
  status: 'running' | 'paused' | 'stopped' | 'completed' | 'failed';
  startedAt: string;
  endedAt?: string;
  summary?: any;
}

// Stored event for history
interface StoredEvent {
  eventId: string;
  campaignId: string;
  eventType: 'job:status' | 'run:status';
  payload: JobStatusPayload | RunStatusPayload;
  timestamp: Date;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
  namespace: '/campaigns',
  // Enable connection state recovery for automatic reconnection handling
  connectionStateRecovery: {
    // Clients can recover their state if they reconnect within 2 minutes
    maxDisconnectionDuration: 2 * 60 * 1000,
    // Skip running middlewares upon successful recovery
    skipMiddlewares: true,
  },
})
export class CampaignWebSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private logger: Logger = new Logger('CampaignWebSocketGateway');

  // In-memory event history - stores recent events per campaign for missed event replay
  // In production, this should be stored in Redis or a similar cache with TTL
  private eventHistory: Map<string, StoredEvent[]> = new Map();
  private readonly MAX_EVENTS_PER_CAMPAIGN = 100; // Keep last 100 events per campaign
  private readonly EVENT_TTL_MS = 10 * 60 * 1000; // Events expire after 10 minutes

  constructor(private readonly supabaseService: SupabaseService) {
    // Clean up old events periodically
    setInterval(() => this.cleanupOldEvents(), 60 * 1000); // Every minute
  }

  /**
   * Remove expired events from history
   */
  private cleanupOldEvents(): void {
    const now = Date.now();
    let totalRemoved = 0;

    for (const [campaignId, events] of this.eventHistory.entries()) {
      const validEvents = events.filter(
        (event) => now - event.timestamp.getTime() < this.EVENT_TTL_MS,
      );

      totalRemoved += events.length - validEvents.length;

      if (validEvents.length === 0) {
        this.eventHistory.delete(campaignId);
      } else {
        this.eventHistory.set(campaignId, validEvents);
      }
    }

    if (totalRemoved > 0) {
      this.logger.debug(`Cleaned up ${totalRemoved} expired events`);
    }
  }

  /**
   * Store an event in history for potential replay
   */
  private storeEvent(event: StoredEvent): void {
    const campaignEvents = this.eventHistory.get(event.campaignId) || [];
    campaignEvents.push(event);

    // Keep only the most recent events
    if (campaignEvents.length > this.MAX_EVENTS_PER_CAMPAIGN) {
      campaignEvents.shift(); // Remove oldest event
    }

    this.eventHistory.set(event.campaignId, campaignEvents);
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`Client attempting connection: ${client.id}`);

    try {
      // Extract token from query params or auth handshake
      const token =
        (client.handshake.query.token as string) ||
        (client.handshake.auth?.token as string);

      if (!token) {
        this.logger.warn(
          `Client ${client.id} disconnected: No authentication token provided`,
        );
        client.disconnect();
        return;
      }

      // Validate token with Supabase
      const { data, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !data.user) {
        this.logger.warn(
          `Client ${client.id} disconnected: Invalid or expired token`,
        );
        client.disconnect();
        return;
      }

      // Attach user to socket
      client.user = data.user;
      this.logger.log(
        `Client ${client.id} authenticated as user ${data.user.id}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Authentication error for client ${client.id}: ${errorMessage}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.user?.id || 'unknown';
    this.logger.log(`Client disconnected: ${client.id} (user: ${userId})`);
    // Leave all rooms on disconnect
    const rooms = Array.from(client.rooms);
    rooms.forEach((room) => {
      if (room !== client.id) {
        this.logger.debug(
          `Client ${client.id} auto-left campaign room: ${room}`,
        );
      }
    });
  }

  @SubscribeMessage('ping')
  handlePing(client: AuthenticatedSocket): string {
    this.logger.debug(`Ping received from client: ${client.id}`);
    return 'pong';
  }

  @SubscribeMessage('join_campaign')
  async handleJoinCampaign(
    @MessageBody() data: JoinCampaignPayload,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<{ success: boolean; message: string; campaignId?: string }> {
    try {
      // Check if user is authenticated
      if (!client.user) {
        this.logger.warn(`Unauthenticated client ${client.id} attempted to join campaign`);
        return {
          success: false,
          message: 'Authentication required',
        };
      }

      const { campaignId } = data;

      if (!campaignId || typeof campaignId !== 'string') {
        this.logger.warn(`Invalid campaign ID from client ${client.id}`);
        return {
          success: false,
          message: 'Invalid campaign ID',
        };
      }

      // Verify user owns the campaign
      try {
        const campaign = await this.supabaseService.getCampaignById(
          campaignId,
          client.user.id,
        );

        if (!campaign) {
          this.logger.warn(
            `Client ${client.id} attempted to join unauthorized campaign ${campaignId}`,
          );
          return {
            success: false,
            message: 'Campaign not found or access denied',
          };
        }
      } catch (error) {
        this.logger.warn(
          `Client ${client.id} attempted to join non-existent campaign ${campaignId}`,
        );
        return {
          success: false,
          message: 'Campaign not found or access denied',
        };
      }

      const roomName = `campaign:${campaignId}`;
      await client.join(roomName);

      this.logger.log(`Client ${client.id} joined campaign room: ${roomName}`);

      return {
        success: true,
        message: `Successfully joined campaign ${campaignId}`,
        campaignId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error joining campaign: ${errorMessage}`, errorStack);
      return {
        success: false,
        message: 'Failed to join campaign',
      };
    }
  }

  @SubscribeMessage('leave_campaign')
  async handleLeaveCampaign(
    @MessageBody() data: LeaveCampaignPayload,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<{ success: boolean; message: string; campaignId?: string }> {
    try {
      // Check if user is authenticated
      if (!client.user) {
        this.logger.warn(`Unauthenticated client ${client.id} attempted to leave campaign`);
        return {
          success: false,
          message: 'Authentication required',
        };
      }

      const { campaignId } = data;

      if (!campaignId || typeof campaignId !== 'string') {
        this.logger.warn(`Invalid campaign ID from client ${client.id}`);
        return {
          success: false,
          message: 'Invalid campaign ID',
        };
      }

      const roomName = `campaign:${campaignId}`;
      await client.leave(roomName);

      this.logger.log(`Client ${client.id} left campaign room: ${roomName}`);

      return {
        success: true,
        message: `Successfully left campaign ${campaignId}`,
        campaignId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error leaving campaign: ${errorMessage}`, errorStack);
      return {
        success: false,
        message: 'Failed to leave campaign',
      };
    }
  }

  @SubscribeMessage('get_subscriptions')
  handleGetSubscriptions(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): { success: boolean; campaigns: string[]; recovered: boolean } {
    // Check if user is authenticated
    if (!client.user) {
      this.logger.warn(
        `Unauthenticated client ${client.id} attempted to get subscriptions`,
      );
      return {
        success: false,
        campaigns: [],
        recovered: false,
      };
    }

    // Get all rooms the client is in, excluding the default room (socket.id)
    const rooms = Array.from(client.rooms).filter(
      (room) => room !== client.id && room.startsWith('campaign:'),
    );

    // Extract campaign IDs from room names
    const campaigns = rooms.map((room) => room.replace('campaign:', ''));

    // Check if this connection recovered from a previous session
    const recovered = (client as any).recovered || false;

    this.logger.debug(
      `Client ${client.id} subscriptions: ${campaigns.join(', ')} (recovered: ${recovered})`,
    );

    return {
      success: true,
      campaigns,
      recovered,
    };
  }

  /**
   * Emit an event to all clients subscribed to a specific campaign
   */
  emitToCampaign(campaignId: string, event: string, data: any): void {
    const roomName = `campaign:${campaignId}`;
    this.server.to(roomName).emit(event, data);
    this.logger.debug(`Emitted ${event} to campaign room: ${roomName}`);
  }

  /**
   * Get the number of clients in a campaign room
   */
  async getCampaignClientCount(campaignId: string): Promise<number> {
    const roomName = `campaign:${campaignId}`;
    const sockets = await this.server.in(roomName).fetchSockets();
    return sockets.length;
  }

  /**
   * Emit a job status update event to campaign subscribers
   */
  emitJobStatus(payload: Omit<JobStatusPayload, 'eventId' | 'timestamp'>): void {
    // Add event ID and timestamp
    const fullPayload: JobStatusPayload = {
      ...payload,
      eventId: this.generateEventId(),
      timestamp: new Date().toISOString(),
    };

    // Store event in history for replay
    this.storeEvent({
      eventId: fullPayload.eventId,
      campaignId: fullPayload.campaignId,
      eventType: 'job:status',
      payload: fullPayload,
      timestamp: new Date(),
    });

    // Emit to subscribers
    this.emitToCampaign(fullPayload.campaignId, 'job:status', fullPayload);
    this.logger.debug(
      `Emitted job status update for job ${fullPayload.jobId}: ${fullPayload.status} (event: ${fullPayload.eventId})`,
    );
  }

  /**
   * Emit a run status update event to campaign subscribers
   */
  emitRunStatus(payload: Omit<RunStatusPayload, 'eventId' | 'timestamp'>): void {
    // Add event ID and timestamp
    const fullPayload: RunStatusPayload = {
      ...payload,
      eventId: this.generateEventId(),
      timestamp: new Date().toISOString(),
    };

    // Store event in history for replay
    this.storeEvent({
      eventId: fullPayload.eventId,
      campaignId: fullPayload.campaignId,
      eventType: 'run:status',
      payload: fullPayload,
      timestamp: new Date(),
    });

    // Emit to subscribers
    this.emitToCampaign(fullPayload.campaignId, 'run:status', fullPayload);
    this.logger.debug(
      `Emitted run status update for run ${fullPayload.runId}: ${fullPayload.status} (event: ${fullPayload.eventId})`,
    );
  }

  @SubscribeMessage('get_missed_events')
  async handleGetMissedEvents(
    @MessageBody() data: GetMissedEventsPayload,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<{
    success: boolean;
    events?: Array<{ type: string; payload: any }>;
    message?: string;
  }> {
    // Check if user is authenticated
    if (!client.user) {
      this.logger.warn(
        `Unauthenticated client ${client.id} attempted to get missed events`,
      );
      return {
        success: false,
        message: 'Authentication required',
      };
    }

    const { campaignId, since, limit = 50 } = data;

    if (!campaignId || typeof campaignId !== 'string') {
      return {
        success: false,
        message: 'Invalid campaign ID',
      };
    }

    // Verify user owns the campaign
    try {
      const campaign = await this.supabaseService.getCampaignById(
        campaignId,
        client.user.id,
      );

      if (!campaign) {
        return {
          success: false,
          message: 'Campaign not found or access denied',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Campaign not found or access denied',
      };
    }

    // Get events for this campaign
    const campaignEvents = this.eventHistory.get(campaignId) || [];

    // Filter events based on 'since' timestamp
    let filteredEvents = campaignEvents;
    if (since) {
      const sinceDate = new Date(since);
      filteredEvents = campaignEvents.filter(
        (event) => event.timestamp > sinceDate,
      );
    }

    // Apply limit
    const limitedEvents = filteredEvents.slice(-limit);

    // Format events for client
    const events = limitedEvents.map((event) => ({
      type: event.eventType,
      payload: event.payload,
    }));

    this.logger.debug(
      `Client ${client.id} requested missed events for campaign ${campaignId}: ${events.length} events returned`,
    );

    return {
      success: true,
      events,
    };
  }
}
