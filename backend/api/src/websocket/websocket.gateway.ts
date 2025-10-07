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
import { Logger } from '@nestjs/common';

interface JoinCampaignPayload {
  campaignId: string;
}

interface LeaveCampaignPayload {
  campaignId: string;
}

// Event payload interfaces
export interface JobStatusPayload {
  jobId: string;
  runId: string;
  campaignId: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  queue: string;
  type: string;
  attempts?: number;
  error?: any;
  timestamp: string;
}

export interface RunStatusPayload {
  runId: string;
  campaignId: string;
  status: 'running' | 'paused' | 'stopped' | 'completed' | 'failed';
  startedAt: string;
  endedAt?: string;
  summary?: any;
  timestamp: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
  namespace: '/campaigns',
})
export class CampaignWebSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private logger: Logger = new Logger('CampaignWebSocketGateway');

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Leave all rooms on disconnect
    const rooms = Array.from(client.rooms);
    rooms.forEach((room) => {
      if (room !== client.id) {
        this.logger.debug(`Client ${client.id} auto-left campaign room: ${room}`);
      }
    });
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket): string {
    this.logger.debug(`Ping received from client: ${client.id}`);
    return 'pong';
  }

  @SubscribeMessage('join_campaign')
  async handleJoinCampaign(
    @MessageBody() data: JoinCampaignPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<{ success: boolean; message: string; campaignId?: string }> {
    try {
      const { campaignId } = data;

      if (!campaignId || typeof campaignId !== 'string') {
        this.logger.warn(`Invalid campaign ID from client ${client.id}`);
        return {
          success: false,
          message: 'Invalid campaign ID',
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
    @ConnectedSocket() client: Socket,
  ): Promise<{ success: boolean; message: string; campaignId?: string }> {
    try {
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
  emitJobStatus(payload: JobStatusPayload): void {
    this.emitToCampaign(payload.campaignId, 'job:status', payload);
    this.logger.debug(
      `Emitted job status update for job ${payload.jobId}: ${payload.status}`,
    );
  }

  /**
   * Emit a run status update event to campaign subscribers
   */
  emitRunStatus(payload: RunStatusPayload): void {
    this.emitToCampaign(payload.campaignId, 'run:status', payload);
    this.logger.debug(
      `Emitted run status update for run ${payload.runId}: ${payload.status}`,
    );
  }
}
