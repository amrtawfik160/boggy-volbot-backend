# Monitoring & Observability Guide

Comprehensive monitoring and observability for the Solana Volume Bot backend using Prometheus metrics, Sentry error tracking, and OpenTelemetry distributed tracing.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Prometheus Metrics](#prometheus-metrics)
- [Sentry Error Tracking](#sentry-error-tracking)
- [OpenTelemetry Distributed Tracing](#opentelemetry-distributed-tracing)
- [Configuration](#configuration)
- [Local Development](#local-development)
- [Production Setup](#production-setup)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

---

## Overview

The Volume Bot backend includes three complementary observability systems:

1. **Prometheus Metrics** - Real-time performance monitoring and alerting
2. **Sentry Error Tracking** - Comprehensive error capture and debugging
3. **OpenTelemetry Tracing** - Distributed tracing across services

### Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     Volume Bot Backend                      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  API Service                    Workers Service            │
│  ┌──────────┐                  ┌──────────┐               │
│  │ HTTP     │ ──Metrics──────> │ Jobs     │               │
│  │ Handlers │ ──Traces───────> │ Handlers │               │
│  │          │ ──Errors───────> │          │               │
│  └──────────┘                  └──────────┘               │
│       │                              │                     │
│       │                              │                     │
└───────┼──────────────────────────────┼─────────────────────┘
        │                              │
        ▼                              ▼
┌───────────────┐  ┌──────────────┐  ┌──────────────┐
│  Prometheus   │  │   Sentry     │  │ OTLP Backend │
│  (Metrics)    │  │  (Errors)    │  │  (Traces)    │
└───────────────┘  └──────────────┘  └──────────────┘
                                      Jaeger/Tempo/etc
```

---

## Quick Start

### 1. Environment Configuration

Add to your `.env` file:

```bash
# Prometheus - Automatic (no config needed)
# Metrics available at http://localhost:3001/metrics

# Sentry Error Tracking
SENTRY_DSN=https://your-key@sentry.io/project-id
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=0.1

# OpenTelemetry Tracing
OTEL_ENABLED=true
OTEL_SERVICE_NAME=volume-bot-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318  # Optional
```

### 2. Start Monitoring Stack (Development)

```bash
# Start Prometheus (scrapes /metrics endpoint)
docker run -d -p 9090:9090 \
  -v ./prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus

# Start Jaeger (OTLP collector for traces)
docker run -d -p 4318:4318 -p 16686:16686 \
  jaegertracing/all-in-one:latest
```

### 3. Access Dashboards

- **API Metrics**: http://localhost:3001/metrics (Prometheus format)
- **Prometheus UI**: http://localhost:9090
- **Jaeger UI**: http://localhost:16686
- **Sentry Dashboard**: https://sentry.io (your project)

---

## Prometheus Metrics

Prometheus metrics expose real-time performance and health data at `/metrics` endpoint.

### Available Metrics

#### Queue Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `volume_bot_queue_depth` | Gauge | `queue_name` | Current number of jobs in queue |
| `volume_bot_jobs_processed_total` | Counter | `queue_name`, `status` | Total jobs processed |
| `volume_bot_jobs_failed_total` | Counter | `queue_name`, `error_type` | Total jobs failed |
| `volume_bot_job_processing_duration_seconds` | Histogram | `queue_name`, `job_type` | Job processing time |

**Queues tracked**: `gather`, `trade.buy`, `trade.sell`, `distribute`, `status`, `webhook`

#### RPC Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `volume_bot_rpc_requests_total` | Counter | `endpoint`, `method` | Total RPC requests |
| `volume_bot_rpc_errors_total` | Counter | `endpoint`, `method`, `error_type` | Total RPC errors |
| `volume_bot_rpc_latency_seconds` | Histogram | `endpoint`, `method` | RPC call latency |

**Methods tracked**: `getAccountInfo`, `getTokenAccountBalance`, `sendTransaction`, etc.

#### API Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `volume_bot_http_requests_total` | Counter | `method`, `path`, `status` | Total HTTP requests |
| `volume_bot_http_request_duration_seconds` | Histogram | `method`, `path`, `status` | HTTP request latency |
| `volume_bot_active_connections` | Gauge | `type` | Active connections |

#### Campaign Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `volume_bot_active_campaigns` | Gauge | - | Number of running campaigns |
| `volume_bot_transactions_total` | Counter | `campaign_id`, `status`, `type` | Total transactions executed |

#### System Metrics (Default)

All prefixed with `volume_bot_`:

- `nodejs_heap_size_total_bytes`
- `nodejs_heap_size_used_bytes`
- `nodejs_external_memory_bytes`
- `nodejs_eventloop_lag_seconds`
- `process_cpu_user_seconds_total`
- `process_cpu_system_seconds_total`
- `process_resident_memory_bytes`

### Example Queries

```promql
# Average job processing time by queue (last 5 minutes)
rate(volume_bot_job_processing_duration_seconds_sum[5m])
  / rate(volume_bot_job_processing_duration_seconds_count[5m])

# RPC error rate
sum(rate(volume_bot_rpc_errors_total[5m])) by (endpoint)

# API 95th percentile latency
histogram_quantile(0.95,
  sum(rate(volume_bot_http_request_duration_seconds_bucket[5m])) by (le, path)
)

# Queue depth trend
volume_bot_queue_depth

# Transaction success rate
sum(rate(volume_bot_transactions_total{status="success"}[5m]))
  / sum(rate(volume_bot_transactions_total[5m]))
```

### Grafana Dashboard

Import the provided Grafana dashboard (see `backend/monitoring/grafana-dashboard.json`) or create custom dashboards using the queries above.

### Alerting Rules

Example Prometheus alerting rules:

```yaml
groups:
  - name: volume_bot
    interval: 30s
    rules:
      # High queue depth
      - alert: HighQueueDepth
        expr: volume_bot_queue_depth > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Queue {{ $labels.queue_name }} has {{ $value }} jobs"

      # High RPC error rate
      - alert: HighRPCErrorRate
        expr: rate(volume_bot_rpc_errors_total[5m]) > 10
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "RPC errors on {{ $labels.endpoint }}: {{ $value }}/s"

      # Slow API responses
      - alert: SlowAPIResponses
        expr: |
          histogram_quantile(0.95,
            rate(volume_bot_http_request_duration_seconds_bucket[5m])
          ) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API 95th percentile latency: {{ $value }}s"
```

---

## Sentry Error Tracking

Sentry captures errors, exceptions, and performance issues from both API and Workers.

### Features

- **Automatic Error Capture**: All uncaught exceptions and 5xx errors
- **Context-Rich Reports**: Request data, user info, breadcrumbs
- **Performance Monitoring**: Transaction tracking for slow operations
- **Release Tracking**: Associate errors with code versions
- **Alert Integration**: Slack, PagerDuty, email notifications

### Setup

1. **Create Sentry Project**
   - Sign up at [sentry.io](https://sentry.io)
   - Create a Node.js project
   - Copy the DSN

2. **Configure Environment**
   ```bash
   SENTRY_DSN=https://your-key@sentry.io/project-id
   SENTRY_ENVIRONMENT=production
   SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% sampling
   ```

3. **Verify Installation**
   ```bash
   # API test script
   cd backend/api
   npx ts-node src/sentry/test-sentry.ts
   ```

### API Integration

#### Automatic Capture

- **5xx Errors**: Automatically sent to Sentry with full context
- **4xx Errors**: NOT sent (client errors, not bugs)
- **Uncaught Exceptions**: Captured with stack traces
- **Sensitive Data**: Automatically redacted (passwords, tokens, keys)

#### Manual Error Tracking

```typescript
import { SentryService } from './sentry/sentry.service';

@Injectable()
export class CampaignsService {
  constructor(private readonly sentry: SentryService) {}

  async processCampaign(campaignId: string) {
    try {
      // ... campaign logic
    } catch (error) {
      // Capture with context
      this.sentry.captureException(error, {
        campaign_id: campaignId,
        user_id: userId,
        custom_data: { /* ... */ }
      });
      throw error;
    }
  }

  async trackOperation() {
    // Add breadcrumbs for debugging
    this.sentry.addBreadcrumb({
      type: 'info',
      category: 'campaign',
      message: 'Started processing campaign',
      data: { campaignId: '123' }
    });
  }
}
```

#### User Context

```typescript
// Set user context (automatically cleared after request)
this.sentry.setUser({
  id: user.id,
  email: user.email,
  username: user.username
});
```

### Workers Integration

Workers automatically capture:
- All job failures with job context (name, ID, data)
- Worker errors with worker name
- Queue processing errors

```typescript
// Custom error capture in workers
import { SentryService } from './services/sentry.service';

try {
  await processJob(job);
} catch (error) {
  SentryService.captureException(error, {
    worker: 'TradeBuyWorker',
    job_id: job.id,
    campaign_id: job.data.campaignId
  });
  throw error;
}
```

### Performance Monitoring

```typescript
// Track slow operations
const transaction = this.sentry.startTransaction({
  op: 'http.server',
  name: 'GET /api/campaigns'
});

try {
  // Create child span
  const dbSpan = transaction?.startChild({
    op: 'database',
    description: 'Fetch campaigns'
  });

  const campaigns = await db.getCampaigns();

  dbSpan?.finish();
  transaction?.setStatus('ok');
} catch (error) {
  transaction?.setStatus('internal_error');
  throw error;
} finally {
  transaction?.finish();
}
```

### Test Endpoints (Development Only)

Available when `NODE_ENV !== 'production'`:

- `GET /v1/sentry-test/test-message` - Test message capture
- `GET /v1/sentry-test/test-error-500` - Test 5xx error capture
- `GET /v1/sentry-test/test-uncaught` - Test uncaught exception
- `POST /v1/sentry-test/test-context` - Test error with context
- `GET /v1/sentry-test/test-transaction` - Test performance tracking

### Error Filtering

Automatically filtered:
- Rate limit errors (429)
- Client validation errors (4xx)
- Sensitive headers and body fields
- Expected business errors (configurable)

---

## OpenTelemetry Distributed Tracing

OpenTelemetry provides end-to-end visibility across API, workers, database, and external services.

### Features

- **Auto-Instrumentation**: HTTP, Express, PostgreSQL, Redis, DNS
- **Custom Spans**: Manual instrumentation for business logic
- **Context Propagation**: Trace requests across service boundaries
- **Multiple Exporters**: Send to Sentry, Jaeger, Tempo, or any OTLP backend
- **BullMQ Integration**: Custom instrumentation for queue operations

### Setup

1. **Configure Exporters**
   ```bash
   # Dual exporters (Sentry + OTLP)
   SENTRY_DSN=https://your-key@sentry.io/project-id
   SENTRY_TRACES_SAMPLE_RATE=0.1
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
   ```

2. **Start OTLP Collector** (optional, for Jaeger/Tempo)
   ```bash
   # Jaeger
   docker run -d -p 4318:4318 -p 16686:16686 \
     jaegertracing/all-in-one:latest

   # Or Grafana Tempo
   docker run -d -p 4318:4318 \
     grafana/tempo:latest
   ```

### Automatic Instrumentation

HTTP requests, database queries, and Redis operations are **automatically traced** with no code changes:

```typescript
// This is automatically traced
@Get('campaigns')
async getCampaigns() {
  // HTTP span created automatically
  // DB queries traced automatically
  return await this.supabase.getCampaigns();
}
```

### Manual Spans (Method Decorator)

```typescript
import { Trace } from '../tracing/trace.decorator';

export class CampaignsService {
  @Trace('calculate-metrics')
  async calculateMetrics(campaignId: string) {
    // Span: "calculate-metrics:CampaignsService.calculateMetrics"
    // ... calculation logic
  }

  @Trace('process-campaign', { priority: 'high', type: 'buy' })
  async processCampaign(id: string) {
    // Custom attributes included in span
  }
}
```

### Manual Spans (Inline)

```typescript
import { withSpan } from '../tracing/trace.decorator';

async function processData() {
  return await withSpan('process-data', async (span) => {
    // Add custom attributes
    span.setAttribute('data.size', dataSize);
    span.setAttribute('data.type', dataType);

    // ... processing logic

    // Add events
    span.addEvent('Processing completed', {
      itemsProcessed: count
    });

    return result;
  });
}
```

### BullMQ Job Tracing

#### Option 1: Wrap Job Processor

```typescript
import { withJobTracing } from '../tracing/bullmq-instrumentation';

const worker = new Worker(
  'my-queue',
  withJobTracing(async (job) => {
    // Job processing automatically traced
    console.log('Processing:', job.id);
    return { success: true };
  }),
  { connection }
);
```

#### Option 2: Instrument Worker Events

```typescript
import { instrumentWorker } from '../tracing/bullmq-instrumentation';

const worker = new Worker('my-queue', async (job) => {
  // Job logic
}, { connection });

instrumentWorker(worker); // Add tracing listeners
```

#### Option 3: Trace Job Enqueueing

```typescript
import { instrumentQueue } from '../tracing/bullmq-instrumentation';

const queue = new Queue('my-queue', { connection });
instrumentQueue(queue);

// Job additions are now traced
await queue.add('my-job', { data: 'value' });
```

### Trace Context

Traces include rich context:

```
Span: GET /api/campaigns
├─ Attributes:
│  ├─ http.method: GET
│  ├─ http.url: /api/campaigns
│  ├─ http.status_code: 200
│  └─ service.name: volume-bot-api
├─ Child: SELECT campaigns
│  ├─ db.system: postgresql
│  ├─ db.statement: SELECT * FROM campaigns WHERE user_id = $1
│  └─ duration: 15ms
└─ Child: Redis GET campaigns:123
   ├─ db.system: redis
   └─ duration: 2ms
```

### Viewing Traces

#### Sentry

1. Go to **Performance** → **Traces**
2. Filter by service name: `volume-bot-api`
3. View waterfall diagrams

#### Jaeger

1. Open http://localhost:16686
2. Select service: `volume-bot-api`
3. Find traces, view detailed spans

### Testing

```bash
# Run test script
cd backend/api
npx ts-node src/tracing/test-tracing.ts

# Check traces in Sentry or Jaeger
```

---

## Configuration

### Environment Variables Reference

```bash
# ==============================================================================
# PROMETHEUS METRICS
# ==============================================================================
# No configuration needed - metrics automatically exposed at /metrics

# ==============================================================================
# SENTRY ERROR TRACKING
# ==============================================================================
SENTRY_DSN=                        # Sentry DSN (get from sentry.io)
SENTRY_ENVIRONMENT=development     # Environment tag (development, staging, production)
SENTRY_TRACES_SAMPLE_RATE=0.1     # Sampling rate for performance (0.0 to 1.0)

# ==============================================================================
# OPENTELEMETRY TRACING
# ==============================================================================
OTEL_ENABLED=true                  # Enable/disable tracing (default: true)
OTEL_SERVICE_NAME=volume-bot-api   # Service name in traces
OTEL_EXPORTER_OTLP_ENDPOINT=       # OTLP endpoint (e.g., http://localhost:4318)
OTEL_EXPORTER_OTLP_HEADERS=        # Optional headers (e.g., "api-key=value")
```

### Prometheus Scrape Configuration

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'volume-bot-api'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'

  - job_name: 'volume-bot-workers'
    static_configs:
      - targets: ['localhost:3002']  # If workers expose metrics
    metrics_path: '/metrics'
```

### Sampling Rates

Adjust based on traffic and budget:

```bash
# Development: 100% sampling
SENTRY_TRACES_SAMPLE_RATE=1.0

# Staging: 50% sampling
SENTRY_TRACES_SAMPLE_RATE=0.5

# Production (low traffic): 10% sampling
SENTRY_TRACES_SAMPLE_RATE=0.1

# Production (high traffic): 1% sampling
SENTRY_TRACES_SAMPLE_RATE=0.01
```

---

## Local Development

### Complete Local Setup

```bash
# 1. Start Redis
docker run -d -p 6379:6379 --name redis redis:7-alpine

# 2. Start Prometheus
docker run -d -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  --name prometheus prom/prometheus

# 3. Start Jaeger (for traces)
docker run -d -p 4318:4318 -p 16686:16686 \
  --name jaeger jaegertracing/all-in-one:latest

# 4. Configure environment
cat > backend/.env <<EOF
SENTRY_DSN=https://your-key@sentry.io/project-id
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=1.0
OTEL_ENABLED=true
OTEL_SERVICE_NAME=volume-bot-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
EOF

# 5. Start services
cd backend/api && pnpm dev &
cd backend/workers && pnpm dev &

# 6. Access dashboards
open http://localhost:3001/metrics  # Metrics
open http://localhost:9090          # Prometheus
open http://localhost:16686         # Jaeger
```

### Testing Metrics

```bash
# Generate sample traffic
for i in {1..100}; do
  curl http://localhost:3001/v1/campaigns
  sleep 0.1
done

# View metrics
curl http://localhost:3001/metrics | grep volume_bot

# Query Prometheus
curl 'http://localhost:9090/api/v1/query?query=volume_bot_http_requests_total'
```

### Testing Error Tracking

```bash
# Trigger test errors (development only)
curl http://localhost:3001/v1/sentry-test/test-message
curl http://localhost:3001/v1/sentry-test/test-error-500

# Check Sentry dashboard
open https://sentry.io/organizations/YOUR_ORG/projects/
```

### Testing Traces

```bash
# Run trace test script
cd backend/api
npx ts-node src/tracing/test-tracing.ts

# View in Jaeger
open http://localhost:16686

# View in Sentry
# Go to Performance → Traces
```

---

## Production Setup

### Infrastructure Requirements

- **Prometheus**: 2GB RAM, 20GB disk (retention: 15 days)
- **Sentry**: Cloud-hosted (sentry.io) or self-hosted
- **Jaeger/Tempo**: 4GB RAM, 50GB disk (optional, for traces)

### Recommended Stack

```
┌─────────────────────────────────────────┐
│         Load Balancer (nginx)           │
└─────────────┬───────────────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
┌───▼────┐         ┌────▼───┐
│  API   │         │ Workers│
│ (x3)   │         │  (x5)  │
└───┬────┘         └────┬───┘
    │                   │
    └─────────┬─────────┘
              │
    ┌─────────┴─────────┐
    │                   │
┌───▼───────┐    ┌──────▼─────┐
│Prometheus │    │   Sentry   │
│+ Grafana  │    │  (Cloud)   │
└───────────┘    └────────────┘
```

### Deployment Checklist

- [ ] Set `SENTRY_ENVIRONMENT=production`
- [ ] Reduce `SENTRY_TRACES_SAMPLE_RATE` to 0.01-0.1
- [ ] Configure Prometheus with persistent storage
- [ ] Set up Grafana dashboards
- [ ] Configure alerting rules
- [ ] Set up alert destinations (Slack, PagerDuty)
- [ ] Disable Sentry test endpoints (automatic in production)
- [ ] Configure log retention policies
- [ ] Set up backup for Prometheus data
- [ ] Document runbooks for common alerts

### Kubernetes Deployment

```yaml
# prometheus-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
    scrape_configs:
      - job_name: 'volume-bot-api'
        kubernetes_sd_configs:
          - role: pod
            namespaces:
              names: ['volume-bot']
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_label_app]
            action: keep
            regex: volume-bot-api

---
# volume-bot-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: volume-bot-api
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: api
        image: volume-bot-api:latest
        env:
        - name: SENTRY_DSN
          valueFrom:
            secretKeyRef:
              name: sentry-secrets
              key: dsn
        - name: SENTRY_ENVIRONMENT
          value: production
        - name: SENTRY_TRACES_SAMPLE_RATE
          value: "0.1"
        - name: OTEL_ENABLED
          value: "true"
        - name: OTEL_EXPORTER_OTLP_ENDPOINT
          value: "http://tempo:4318"
```

### CloudWatch Integration (AWS)

```bash
# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
sudo rpm -U ./amazon-cloudwatch-agent.rpm

# Configure CloudWatch to scrape Prometheus metrics
cat > /opt/aws/amazon-cloudwatch-agent/etc/prometheus.yaml <<EOF
global:
  scrape_interval: 1m
scrape_configs:
  - job_name: volume-bot
    static_configs:
      - targets: ['localhost:3001']
EOF

# Start CloudWatch agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/prometheus.yaml
```

---

## Troubleshooting

### Metrics Not Appearing

**Issue**: `/metrics` endpoint returns empty or incomplete metrics

**Solutions**:
1. Check MetricsService is properly initialized
   ```bash
   curl http://localhost:3001/metrics | grep volume_bot
   ```

2. Verify metrics are being incremented
   ```typescript
   // Add debug logging
   console.log('Incrementing metric:', metricName);
   this.metricsService.httpRequestsCounter.inc();
   ```

3. Check Prometheus scraping
   ```bash
   # View Prometheus targets
   curl http://localhost:9090/api/v1/targets
   ```

### Sentry Errors Not Captured

**Issue**: Errors not appearing in Sentry dashboard

**Solutions**:
1. Verify DSN is correct
   ```bash
   echo $SENTRY_DSN
   # Should start with https://
   ```

2. Check Sentry is initialized
   ```bash
   # Look for initialization message in logs
   grep "Sentry initialized" logs/api.log
   ```

3. Test with manual capture
   ```typescript
   this.sentry.captureMessage('Test message', 'info');
   ```

4. Check error filtering
   - 4xx errors are NOT sent (by design)
   - Only 5xx errors are captured

5. Verify internet connectivity (Sentry is cloud-hosted)

### Traces Not Appearing

**Issue**: Traces not showing in Jaeger or Sentry

**Solutions**:
1. Check OTLP endpoint is reachable
   ```bash
   curl -X POST http://localhost:4318/v1/traces \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

2. Verify sampling rate > 0
   ```bash
   echo $SENTRY_TRACES_SAMPLE_RATE
   # Should be between 0.0 and 1.0
   ```

3. Check OpenTelemetry initialization
   ```bash
   # Look for init message
   grep "OpenTelemetry" logs/api.log
   ```

4. Test with manual span
   ```typescript
   import { withSpan } from '../tracing/trace.decorator';

   await withSpan('test-span', async (span) => {
     span.setAttribute('test', 'value');
   });
   ```

### High Memory Usage

**Issue**: Application memory growing over time

**Solutions**:
1. Reduce trace sampling
   ```bash
   SENTRY_TRACES_SAMPLE_RATE=0.01  # 1% sampling
   ```

2. Limit span attributes size
   ```typescript
   // Don't include large objects
   span.setAttribute('job.data', JSON.stringify(job.data).slice(0, 1000));
   ```

3. Disable unused auto-instrumentations
   ```typescript
   // In tracing/init.ts
   registerInstrumentations({
     instrumentations: [
       // Remove unused instrumentations
       new HttpInstrumentation(),
       // new FsInstrumentation(), // Disabled
     ]
   });
   ```

### Broken Traces (Spans Not Connected)

**Issue**: Spans appear disconnected in trace view

**Solutions**:
1. Ensure context propagation
   ```typescript
   // Use context.with() for async operations
   import { context } from '@opentelemetry/api';

   const activeContext = context.active();
   await context.with(activeContext, async () => {
     // Operations here maintain trace context
   });
   ```

2. Use `withJobTracing()` for BullMQ jobs
   ```typescript
   const worker = new Worker('queue', withJobTracing(handler), options);
   ```

3. Check trace ID is propagated
   ```typescript
   import { trace } from '@opentelemetry/api';

   const span = trace.getActiveSpan();
   console.log('Trace ID:', span?.spanContext().traceId);
   ```

---

## Best Practices

### Metrics

✅ **Do:**
- Track business metrics (campaigns created, transactions succeeded)
- Use histograms for latencies (pre-defined buckets)
- Keep label cardinality low (<100 unique values per label)
- Document custom metrics in code comments
- Use meaningful metric names (follow Prometheus naming conventions)

❌ **Don't:**
- Don't use high-cardinality labels (user IDs, timestamps, etc.)
- Don't create metrics dynamically based on user input
- Don't track PII in metric labels
- Don't expose internal implementation details

### Error Tracking

✅ **Do:**
- Add context to all manual error captures
- Set user context when available
- Use breadcrumbs for debugging complex flows
- Tag errors for easier filtering
- Set appropriate error severity levels

❌ **Don't:**
- Don't over-report (avoid sending expected validation errors)
- Don't include sensitive data in error context
- Don't send 4xx client errors to Sentry
- Don't capture errors that are handled gracefully

### Tracing

✅ **Do:**
- Use auto-instrumentation for common operations
- Add `@Trace()` to business logic methods
- Include meaningful span attributes
- Use sampling in production
- Keep span attribute values small (<1KB)

❌ **Don't:**
- Don't manually trace auto-instrumented operations
- Don't add sensitive data as span attributes
- Don't create excessive spans (>100 per request)
- Don't log large objects as attributes
- Don't use 100% sampling in high-traffic production

### General

✅ **Do:**
- Monitor your monitoring stack (meta-monitoring)
- Set up alerts for critical issues
- Document runbooks for common alerts
- Regularly review dashboards and adjust
- Test monitoring in staging before production

❌ **Don't:**
- Don't alert on everything (alert fatigue)
- Don't ignore alerts (they should be actionable)
- Don't forget to update monitoring with new features
- Don't expose monitoring endpoints publicly

---

## Resources

### Documentation

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Sentry Node.js Docs](https://docs.sentry.io/platforms/node/)
- [OpenTelemetry JS Docs](https://opentelemetry.io/docs/instrumentation/js/)
- [Grafana Getting Started](https://grafana.com/docs/grafana/latest/getting-started/)

### Tools

- [PromQL Tutorial](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Sentry Query Builder](https://docs.sentry.io/product/discover-queries/)
- [Jaeger UI Guide](https://www.jaegertracing.io/docs/latest/frontend-ui/)

### Component-Specific Docs

- [Prometheus Metrics](./api/src/metrics/README.md) - Detailed metrics implementation
- [Sentry Integration](./api/src/sentry/README.md) - Error tracking setup
- [OpenTelemetry Tracing](./api/src/tracing/README.md) - Distributed tracing guide

---

**Last Updated**: 2025-10-13
**Maintained By**: Volume Bot Backend Team
