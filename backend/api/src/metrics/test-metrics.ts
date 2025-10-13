/**
 * Simple test script to verify metrics service works independently
 */
import { MetricsService } from './metrics.service';

async function testMetrics() {
  const metricsService = new MetricsService();

  // Simulate some metrics
  metricsService.queueDepthGauge.set({ queue_name: 'volume-generation' }, 5);
  metricsService.queueDepthGauge.set({ queue_name: 'transaction-processing' }, 12);

  metricsService.jobsProcessedCounter.inc({ queue_name: 'volume-generation', status: 'completed' }, 100);
  metricsService.jobsProcessedCounter.inc({ queue_name: 'volume-generation', status: 'failed' }, 5);

  metricsService.rpcRequestsCounter.inc({ endpoint: 'https://api.mainnet-beta.solana.com', method: 'getLatestBlockhash' }, 50);
  metricsService.rpcLatencyHistogram.observe({ endpoint: 'https://api.mainnet-beta.solana.com', method: 'getLatestBlockhash' }, 0.125);

  metricsService.httpRequestsCounter.inc({ method: 'GET', path: '/v1/campaigns', status: '200' }, 25);
  metricsService.httpRequestDuration.observe({ method: 'GET', path: '/v1/campaigns', status: '200' }, 0.05);

  metricsService.activeCampaignsGauge.set(3);
  metricsService.transactionsCounter.inc({ campaign_id: 'camp-1', status: 'success', type: 'swap' }, 150);

  // Get and display metrics
  const metrics = await metricsService.getMetrics();
  console.log('=== Prometheus Metrics Output ===\n');
  console.log(metrics);
}

testMetrics().catch(console.error);
