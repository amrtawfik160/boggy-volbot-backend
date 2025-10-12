import { BaseWorker, BaseWorkerConfig, JobContext } from './BaseWorker';
import { WebhookJobPayload } from '../types';

export interface WebhookJobData {
  userId?: string;
  event: string;
  payload: unknown;
  dbJobId?: string;
}

export interface WebhookJobResult {
  success: boolean;
  sent?: number;
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

  protected async execute(
    data: WebhookJobData,
    context: JobContext
  ): Promise<WebhookJobResult> {
    const { userId, event, payload } = data;

    await context.updateProgress(20, 'Fetching user webhooks');

    // Get user webhooks
    const { data: webhooks, error } = await context.supabase
      .from('webhooks')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error || !webhooks || webhooks.length === 0) {
      console.log(`[WEBHOOK] No webhooks configured for user ${userId}`);
      return { success: true, sent: 0 };
    }

    await context.updateProgress(40, `Sending ${webhooks.length} webhooks`);

    // Send webhooks
    const results = await Promise.allSettled(
      webhooks.map(async (webhook) => {
        if (!webhook.events.includes(event)) {
          return;
        }

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': webhook.secret,
          },
          body: JSON.stringify({
            event,
            payload,
            timestamp: new Date().toISOString()
          }),
        });

        if (!response.ok) {
          throw new Error(`Webhook failed: ${response.status}`);
        }

        return response;
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value !== undefined).length;

    await context.updateProgress(100, `Webhooks sent: ${successCount}/${webhooks.length}`);

    return { success: true, sent: successCount };
  }
}
