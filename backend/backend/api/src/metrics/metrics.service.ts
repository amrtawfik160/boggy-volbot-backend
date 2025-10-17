import { Injectable } from '@nestjs/common';
import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry: Registry;

  // Queue metrics
  public readonly queueDepthGauge: Gauge<string>;
  public readonly jobsProcessedCounter: Counter<string>;
  public readonly jobsFailedCounter: Counter<string>;
  public readonly jobProcessingDuration: Histogram<string>;

  // RPC metrics
  public readonly rpcRequestsCounter: Counter<string>;
  public readonly rpcErrorsCounter: Counter<string>;
  public readonly rpcLatencyHistogram: Histogram<string>;

  // API metrics
  public readonly httpRequestsCounter: Counter<string>;
  public readonly httpRequestDuration: Histogram<string>;
  public readonly activeConnectionsGauge: Gauge<string>;

  // Campaign metrics
  public readonly activeCampaignsGauge: Gauge<string>;
  public readonly transactionsCounter: Counter<string>;

  constructor() {
    this.registry = new Registry();

    // Collect default metrics (CPU, memory, etc.)
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'volume_bot_',
    });

    // Queue metrics
    this.queueDepthGauge = new Gauge({
      name: 'volume_bot_queue_depth',
      help: 'Current depth of job queues',
      labelNames: ['queue_name'],
      registers: [this.registry],
    });

    this.jobsProcessedCounter = new Counter({
      name: 'volume_bot_jobs_processed_total',
      help: 'Total number of jobs processed',
      labelNames: ['queue_name', 'status'],
      registers: [this.registry],
    });

    this.jobsFailedCounter = new Counter({
      name: 'volume_bot_jobs_failed_total',
      help: 'Total number of failed jobs',
      labelNames: ['queue_name', 'error_type'],
      registers: [this.registry],
    });

    this.jobProcessingDuration = new Histogram({
      name: 'volume_bot_job_processing_duration_seconds',
      help: 'Job processing duration in seconds',
      labelNames: ['queue_name', 'job_type'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });

    // RPC metrics
    this.rpcRequestsCounter = new Counter({
      name: 'volume_bot_rpc_requests_total',
      help: 'Total number of RPC requests',
      labelNames: ['endpoint', 'method'],
      registers: [this.registry],
    });

    this.rpcErrorsCounter = new Counter({
      name: 'volume_bot_rpc_errors_total',
      help: 'Total number of RPC errors',
      labelNames: ['endpoint', 'method', 'error_type'],
      registers: [this.registry],
    });

    this.rpcLatencyHistogram = new Histogram({
      name: 'volume_bot_rpc_latency_seconds',
      help: 'RPC request latency in seconds',
      labelNames: ['endpoint', 'method'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    // API metrics
    this.httpRequestsCounter = new Counter({
      name: 'volume_bot_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'volume_bot_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.activeConnectionsGauge = new Gauge({
      name: 'volume_bot_active_connections',
      help: 'Number of active connections',
      labelNames: ['type'],
      registers: [this.registry],
    });

    // Campaign metrics
    this.activeCampaignsGauge = new Gauge({
      name: 'volume_bot_active_campaigns',
      help: 'Number of currently active campaigns',
      registers: [this.registry],
    });

    this.transactionsCounter = new Counter({
      name: 'volume_bot_transactions_total',
      help: 'Total number of transactions',
      labelNames: ['campaign_id', 'status', 'type'],
      registers: [this.registry],
    });
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get the registry instance (for testing or advanced usage)
   */
  getRegistry(): Registry {
    return this.registry;
  }
}
