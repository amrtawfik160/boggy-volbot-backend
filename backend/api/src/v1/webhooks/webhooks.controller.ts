import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../guards/supabase-auth.guard';
import { User } from '../../decorators/user.decorator';
import { SupabaseService } from '../../services/supabase.service';
import { CreateWebhookDto, UpdateWebhookDto, TestWebhookDto, WebhookDeliveryQueryDto } from './webhooks.dto';
import { Queue } from 'bullmq';
import { getRedisClient } from '../../config/redis.config';
import { createLogger } from '../../config/logger.config';

const logger = createLogger('webhooks-controller');

@Controller('v1/webhooks')
@UseGuards(SupabaseAuthGuard)
export class WebhooksController {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Get all webhooks for the authenticated user
   */
  @Get()
  async listWebhooks(@User() user: any) {
    const { data, error } = await this.supabase.getClient()
      .from('webhooks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error, userId: user.id }, 'Failed to fetch webhooks');
      throw new Error('Failed to fetch webhooks');
    }

    return {
      success: true,
      webhooks: data,
    };
  }

  /**
   * Get a single webhook by ID
   */
  @Get(':id')
  async getWebhook(@User() user: any, @Param('id') id: string) {
    const { data, error } = await this.supabase.getClient()
      .from('webhooks')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      logger.error({ error, userId: user.id, webhookId: id }, 'Webhook not found');
      throw new Error('Webhook not found');
    }

    return {
      success: true,
      webhook: data,
    };
  }

  /**
   * Create a new webhook
   */
  @Post()
  async createWebhook(@User() user: any, @Body() dto: CreateWebhookDto) {
    const { data, error } = await this.supabase.getClient()
      .from('webhooks')
      .insert({
        user_id: user.id,
        url: dto.url,
        events: dto.events,
        secret: dto.secret,
        is_active: true,
      })
      .select()
      .single();

    if (error || !data) {
      logger.error({ error, userId: user.id }, 'Failed to create webhook');
      throw new Error('Failed to create webhook');
    }

    logger.info({ userId: user.id, webhookId: data.id, url: dto.url }, 'Webhook created');

    return {
      success: true,
      webhook: data,
    };
  }

  /**
   * Update an existing webhook
   */
  @Put(':id')
  async updateWebhook(
    @User() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto
  ) {
    const { data, error } = await this.supabase.getClient()
      .from('webhooks')
      .update({
        ...(dto.url && { url: dto.url }),
        ...(dto.events && { events: dto.events }),
        ...(dto.secret && { secret: dto.secret }),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !data) {
      logger.error({ error, userId: user.id, webhookId: id }, 'Failed to update webhook');
      throw new Error('Failed to update webhook');
    }

    logger.info({ userId: user.id, webhookId: id }, 'Webhook updated');

    return {
      success: true,
      webhook: data,
    };
  }

  /**
   * Delete a webhook
   */
  @Delete(':id')
  async deleteWebhook(@User() user: any, @Param('id') id: string) {
    const { error } = await this.supabase.getClient()
      .from('webhooks')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      logger.error({ error, userId: user.id, webhookId: id }, 'Failed to delete webhook');
      throw new Error('Failed to delete webhook');
    }

    logger.info({ userId: user.id, webhookId: id }, 'Webhook deleted');

    return {
      success: true,
      message: 'Webhook deleted successfully',
    };
  }

  /**
   * Send a test webhook
   */
  @Post('test')
  async testWebhook(@User() user: any, @Body() dto: TestWebhookDto) {
    const { webhookId, event = 'test_event' } = dto;

    // Verify webhook belongs to user
    const { data: webhook, error: webhookError } = await this.supabase.getClient()
      .from('webhooks')
      .select('*')
      .eq('id', webhookId)
      .eq('user_id', user.id)
      .single();

    if (webhookError || !webhook) {
      logger.error({ error: webhookError, userId: user.id, webhookId }, 'Webhook not found');
      throw new Error('Webhook not found');
    }

    // Create test payload
    const testPayload = {
      message: 'This is a test webhook',
      timestamp: new Date().toISOString(),
      webhook_id: webhookId,
      test: true,
    };

    // Queue webhook job
    const redis = getRedisClient();
    const webhookQueue = new Queue('webhook', { connection: redis as any });

    const job = await webhookQueue.add(
      'test-webhook',
      {
        userId: user.id,
        event,
        payload: testPayload,
      },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 60000, // Start with 1 minute
        },
        removeOnComplete: true,
      }
    );

    await webhookQueue.close();

    logger.info({ userId: user.id, webhookId, jobId: job.id }, 'Test webhook queued');

    return {
      success: true,
      message: 'Test webhook queued for delivery',
      jobId: job.id,
      event,
      payload: testPayload,
    };
  }

  /**
   * Get webhook delivery logs
   */
  @Get(':id/deliveries')
  async getWebhookDeliveries(
    @User() user: any,
    @Param('id') id: string,
    @Query() query: WebhookDeliveryQueryDto
  ) {
    // Verify webhook belongs to user
    const { data: webhook, error: webhookError } = await this.supabase.getClient()
      .from('webhooks')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (webhookError || !webhook) {
      logger.error({ error: webhookError, userId: user.id, webhookId: id }, 'Webhook not found');
      throw new Error('Webhook not found');
    }

    // Build query
    let queryBuilder = this.supabase.getClient()
      .from('webhook_deliveries')
      .select('*', { count: 'exact' })
      .eq('webhook_id', id)
      .order('created_at', { ascending: false });

    if (query.status) {
      queryBuilder = queryBuilder.eq('status', query.status);
    }

    if (query.event) {
      queryBuilder = queryBuilder.eq('event', query.event);
    }

    const limit = Math.min(query.limit || 50, 100);
    const offset = query.offset || 0;

    const { data, error, count } = await queryBuilder
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error({ error, userId: user.id, webhookId: id }, 'Failed to fetch deliveries');
      throw new Error('Failed to fetch deliveries');
    }

    return {
      success: true,
      deliveries: data,
      pagination: {
        total: count || 0,
        limit,
        offset,
      },
    };
  }

  /**
   * Get all delivery logs for the user (across all webhooks)
   */
  @Get('deliveries/all')
  async getAllDeliveries(
    @User() user: any,
    @Query() query: WebhookDeliveryQueryDto
  ) {
    // Build query
    let queryBuilder = this.supabase.getClient()
      .from('webhook_deliveries')
      .select('*, webhooks!inner(url, events)', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (query.status) {
      queryBuilder = queryBuilder.eq('status', query.status);
    }

    if (query.event) {
      queryBuilder = queryBuilder.eq('event', query.event);
    }

    const limit = Math.min(query.limit || 50, 100);
    const offset = query.offset || 0;

    const { data, error, count } = await queryBuilder
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error({ error, userId: user.id }, 'Failed to fetch all deliveries');
      throw new Error('Failed to fetch deliveries');
    }

    return {
      success: true,
      deliveries: data,
      pagination: {
        total: count || 0,
        limit,
        offset,
      },
    };
  }
}
