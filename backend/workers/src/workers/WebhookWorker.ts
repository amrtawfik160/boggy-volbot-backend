import { createHmac } from 'node:crypto';
import { BaseWorker, BaseWorkerConfig, JobContext } from './BaseWorker';

export interface WebhookJobData {
  userId?: string;
  event: string;
  payload: unknown;
  dbJobId?: string;
  deliveryId?: string; // For retry tracking
}

export interface WebhookJobResult {
  success: boolean;
  sent: number;
  failed: number;
  deliveryIds: string[];
}

interface WebhookDeliveryAttempt {
  webhookId: string;
  url: string;
  secret: string;
  deliveryId?: string;
}

export class WebhookWorker extends BaseWorker<WebhookJobData, WebhookJobResult> {
  constructor(config: Omit<BaseWorkerConfig, 'queueName'>) {
    super({
      ...config,
      queueName: 'webhook',
      concurrency: 10,
      enableIdempotency: false,
      enableDeadLetterQueue: true,
    });
  }

  /**
   * Generate HMAC SHA-256 signature for webhook payload
   */
  private generateSignature(payload: string, secret: string): string {
    return createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Calculate exponential backoff delay for retry
   */
  private calculateRetryDelay(attemptNumber: number): Date {
    // Exponential backoff: 2^attempt * 60 seconds (1min, 2min, 4min, 8min, 16min)
    const delaySeconds = Math.min(Math.pow(2, attemptNumber) * 60, 3600); // Max 1 hour
    return new Date(Date.now() + delaySeconds * 1000);
  }

  /**
   * Deliver webhook to a single endpoint
   */
  private async deliverWebhook(
    attempt: WebhookDeliveryAttempt,
    event: string,
    payload: unknown,
    userId: string | undefined,
    context: JobContext
  ): Promise<{ success: boolean; deliveryId: string }> {
    const { webhookId, url, secret, deliveryId } = attempt;
    const timestamp = new Date().toISOString();

    // Prepare payload
    const webhookPayload = {
      event,
      payload,
      timestamp,
    };
    const payloadString = JSON.stringify(webhookPayload);

    // Generate HMAC signature
    const signature = this.generateSignature(payloadString, secret);

    let currentDeliveryId = deliveryId;
    let attemptNumber = 1;

    // If this is a retry, get the existing delivery record
    if (deliveryId) {
      const { data: existingDelivery } = await context.supabase
        .from('webhook_deliveries')
        .select('attempt_number')
        .eq('id', deliveryId)
        .single();

      if (existingDelivery) {
        attemptNumber = existingDelivery.attempt_number + 1;
      }
    } else {
      // Create initial delivery record
      const { data: newDelivery, error: insertError } = await context.supabase
        .from('webhook_deliveries')
        .insert({
          webhook_id: webhookId,
          user_id: userId || '',
          event,
          payload: webhookPayload,
          url,
          status: 'pending',
          signature,
          attempt_number: 1,
          max_attempts: 5,
        })
        .select('id')
        .single();

      if (insertError || !newDelivery) {
        context.logger.error({ error: insertError }, 'Failed to create delivery record');
        throw new Error('Failed to create delivery record');
      }

      currentDeliveryId = newDelivery.id;
    }

    try {
      // Send webhook request
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
          'X-Webhook-Timestamp': timestamp,
        },
        body: payloadString,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      const responseBody = await response.text().catch(() => '');

      if (response.ok) {
        // Success - update delivery record
        await context.supabase
          .from('webhook_deliveries')
          .update({
            status: 'success',
            http_status_code: response.status,
            response_body: responseBody.substring(0, 1000), // Limit stored response
            delivered_at: new Date().toISOString(),
            attempt_number: attemptNumber,
          })
          .eq('id', currentDeliveryId);

        context.logger.info({
          deliveryId: currentDeliveryId,
          webhookId,
          url,
          status: response.status,
        }, 'Webhook delivered successfully');

        return { success: true, deliveryId: currentDeliveryId! };
      } else {
        // HTTP error - determine if we should retry
        const shouldRetry = attemptNumber < 5 && response.status >= 500;
        const status = shouldRetry ? 'retrying' : 'failed';
        const nextRetryAt = shouldRetry ? this.calculateRetryDelay(attemptNumber) : null;

        await context.supabase
          .from('webhook_deliveries')
          .update({
            status,
            http_status_code: response.status,
            response_body: responseBody.substring(0, 1000),
            error_message: `HTTP ${response.status}: ${response.statusText}`,
            attempt_number: attemptNumber,
            next_retry_at: nextRetryAt?.toISOString(),
          })
          .eq('id', currentDeliveryId);

        if (shouldRetry) {
          // Schedule retry job
          const Queue = (await import('bullmq')).Queue;
          const webhookQueue = new Queue('webhook', { connection: this.config.connection });

          await webhookQueue.add(
            'webhook-retry',
            {
              userId,
              event,
              payload,
              deliveryId: currentDeliveryId,
            },
            {
              delay: (nextRetryAt!.getTime() - Date.now()),
              attempts: 1, // Each retry is a single attempt
              removeOnComplete: true,
            }
          );

          await webhookQueue.close();

          context.logger.warn({
            deliveryId: currentDeliveryId,
            webhookId,
            attemptNumber,
            nextRetryAt,
            status: response.status,
          }, 'Webhook delivery failed, scheduled for retry');
        } else {
          context.logger.error({
            deliveryId: currentDeliveryId,
            webhookId,
            status: response.status,
            responseBody,
          }, 'Webhook delivery failed permanently');
        }

        throw new Error(`Webhook delivery failed: HTTP ${response.status}`);
      }
    } catch (error: any) {
      // Network error or timeout
      const shouldRetry = attemptNumber < 5;
      const status = shouldRetry ? 'retrying' : 'failed';
      const nextRetryAt = shouldRetry ? this.calculateRetryDelay(attemptNumber) : null;
      const errorMessage = error.message || 'Unknown error';

      await context.supabase
        .from('webhook_deliveries')
        .update({
          status,
          error_message: errorMessage,
          attempt_number: attemptNumber,
          next_retry_at: nextRetryAt?.toISOString(),
        })
        .eq('id', currentDeliveryId);

      if (shouldRetry) {
        // Schedule retry job
        const Queue = (await import('bullmq')).Queue;
        const webhookQueue = new Queue('webhook', { connection: this.config.connection });

        await webhookQueue.add(
          'webhook-retry',
          {
            userId,
            event,
            payload,
            deliveryId: currentDeliveryId,
          },
          {
            delay: (nextRetryAt!.getTime() - Date.now()),
            attempts: 1,
            removeOnComplete: true,
          }
        );

        await webhookQueue.close();

        context.logger.warn({
          deliveryId: currentDeliveryId,
          webhookId,
          attemptNumber,
          nextRetryAt,
          error: errorMessage,
        }, 'Webhook delivery failed, scheduled for retry');
      } else {
        context.logger.error({
          deliveryId: currentDeliveryId,
          webhookId,
          error: errorMessage,
        }, 'Webhook delivery failed permanently after max retries');
      }

      throw error;
    }
  }

  protected async execute(
    data: WebhookJobData,
    context: JobContext
  ): Promise<WebhookJobResult> {
    const { userId, event, payload, deliveryId } = data;

    await context.updateProgress(10, 'Processing webhook job');

    // If this is a retry with a deliveryId, get the webhook from the delivery record
    if (deliveryId) {
      const { data: delivery, error: deliveryError } = await context.supabase
        .from('webhook_deliveries')
        .select('webhook_id, url, webhooks!inner(secret)')
        .eq('id', deliveryId)
        .single();

      if (deliveryError || !delivery) {
        context.logger.error({ deliveryId, error: deliveryError }, 'Failed to fetch delivery record for retry');
        return { success: false, sent: 0, failed: 1, deliveryIds: [deliveryId] };
      }

      await context.updateProgress(50, 'Retrying webhook delivery');

      try {
        const result = await this.deliverWebhook(
          {
            webhookId: delivery.webhook_id,
            url: delivery.url,
            secret: (delivery.webhooks as any).secret,
            deliveryId,
          },
          event,
          payload,
          userId,
          context
        );

        await context.updateProgress(100, 'Webhook retry completed');
        return { success: true, sent: 1, failed: 0, deliveryIds: [result.deliveryId] };
      } catch (error) {
        await context.updateProgress(100, 'Webhook retry failed');
        return { success: false, sent: 0, failed: 1, deliveryIds: [deliveryId] };
      }
    }

    // Normal flow: Get all active webhooks for the user
    await context.updateProgress(20, 'Fetching user webhooks');

    const { data: webhooks, error } = await context.supabase
      .from('webhooks')
      .select('id, url, events, secret')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      context.logger.error({ error, userId }, 'Failed to fetch webhooks');
      throw new Error('Failed to fetch webhooks');
    }

    if (!webhooks || webhooks.length === 0) {
      context.logger.info({ userId }, 'No active webhooks configured for user');
      return { success: true, sent: 0, failed: 0, deliveryIds: [] };
    }

    // Filter webhooks that are subscribed to this event
    const subscribedWebhooks = webhooks.filter(w => w.events.includes(event));

    if (subscribedWebhooks.length === 0) {
      context.logger.info({ userId, event }, 'No webhooks subscribed to this event');
      return { success: true, sent: 0, failed: 0, deliveryIds: [] };
    }

    await context.updateProgress(40, `Delivering to ${subscribedWebhooks.length} webhooks`);

    // Deliver to all subscribed webhooks
    const results = await Promise.allSettled(
      subscribedWebhooks.map(webhook =>
        this.deliverWebhook(
          {
            webhookId: webhook.id,
            url: webhook.url,
            secret: webhook.secret,
          },
          event,
          payload,
          userId,
          context
        )
      )
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCount = results.filter(r => r.status === 'rejected').length;
    const deliveryIds = results
      .filter((r): r is PromiseFulfilledResult<{ success: boolean; deliveryId: string }> => r.status === 'fulfilled')
      .map(r => r.value.deliveryId);

    await context.updateProgress(100, `Delivered: ${successCount}/${subscribedWebhooks.length}`);

    context.logger.info({
      event,
      total: subscribedWebhooks.length,
      success: successCount,
      failed: failedCount,
    }, 'Webhook batch delivery completed');

    return {
      success: failedCount === 0,
      sent: successCount,
      failed: failedCount,
      deliveryIds,
    };
  }
}
