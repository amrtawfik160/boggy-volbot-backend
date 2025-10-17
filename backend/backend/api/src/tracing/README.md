# OpenTelemetry Distributed Tracing

This directory contains the OpenTelemetry distributed tracing implementation for the Volume Bot API.

## Overview

OpenTelemetry provides comprehensive distributed tracing across:
- **HTTP API requests** - Automatically traced via auto-instrumentation
- **BullMQ job processing** - Custom instrumentation for queue operations
- **Database queries** - PostgreSQL queries via pg instrumentation
- **Redis operations** - ioredis instrumentation
- **RPC calls** - Manual instrumentation available

Traces can be exported to:
- **Sentry** - Integrated with existing error tracking
- **OTLP Collectors** - Send to Jaeger, Tempo, or other OTLP-compatible backends

## Architecture

```
┌─────────────┐
│  main.ts    │ Import tracing/init.ts FIRST
└──────┬──────┘
       │
       ├─> tracing/init.ts          [Auto-initialization]
       │   ├─> Sentry integration
       │   ├─> OTLP exporter
       │   └─> Auto-instrumentations (HTTP, Express, pg, ioredis)
       │
       ├─> tracing/service.ts        [Service wrapper (optional)]
       ├─> tracing/trace.decorator.ts [Manual tracing helpers]
       └─> tracing/bullmq-instrumentation.ts [BullMQ tracing]
```

## Files

### Core Files

- **`init.ts`** - Early initialization (imported first in main.ts)
  - Sets up OpenTelemetry SDK
  - Configures Sentry and OTLP exporters
  - Enables auto-instrumentations

- **`tracing.service.ts`** - NestJS service wrapper (optional)
  - Alternative initialization via NestJS lifecycle
  - Not currently used (init.ts handles initialization)

- **`tracing.module.ts`** - NestJS module (optional)
  - Global module for TracingService
  - Not currently used

### Helper Files

- **`trace.decorator.ts`** - Manual tracing decorators
  - `@Trace()` decorator for methods
  - `withSpan()` helper for inline spans

- **`bullmq-instrumentation.ts`** - BullMQ tracing
  - `withJobTracing()` - Wraps job processors
  - `instrumentWorker()` - Adds event listeners
  - `instrumentQueue()` - Traces job enqueueing

## Configuration

Add to your `.env` file:

```env
# OpenTelemetry Tracing
OTEL_ENABLED=true                          # Enable/disable tracing (default: true)
OTEL_SERVICE_NAME=volume-bot-api           # Service name
OTEL_EXPORTER_OTLP_ENDPOINT=               # OTLP endpoint (optional)
OTEL_EXPORTER_OTLP_HEADERS=                # OTLP headers (optional)

# Sentry (automatically used for tracing if set)
SENTRY_DSN=https://...                     # Sentry DSN
SENTRY_TRACES_SAMPLE_RATE=0.1              # 10% sampling
```

## Usage

### Automatic Instrumentation

HTTP requests, Express routes, database queries, and Redis operations are **automatically traced** with no code changes required.

```typescript
// HTTP endpoints are automatically traced
@Get('campaigns')
async getCampaigns() {
  // This entire request is traced, including DB queries
  return await this.supabase.getCampaigns();
}
```

### Manual Spans (Method Decorator)

Use the `@Trace()` decorator to add custom spans to specific methods:

```typescript
import { Trace } from '../tracing/trace.decorator';

export class CampaignsService {
  @Trace('calculate-metrics')
  async calculateCampaignMetrics(campaignId: string) {
    // This method will be traced as "calculate-metrics:CampaignsService.calculateCampaignMetrics"
    // ... calculation logic
  }

  @Trace('process-campaign', { priority: 'high' })
  async processCampaign(id: string) {
    // Custom attributes can be passed
  }
}
```

### Manual Spans (Inline)

For more control, use `withSpan()`:

```typescript
import { withSpan } from '../tracing/trace.decorator';

async function processData() {
  return await withSpan('process-data', async (span) => {
    span.setAttribute('data.size', dataSize);
    span.setAttribute('data.type', dataType);

    // ... processing logic

    span.addEvent('Processing completed', {
      itemsProcessed: count,
    });

    return result;
  });
}
```

### BullMQ Job Tracing

#### Option 1: Wrap Job Processor

```typescript
import { Worker } from 'bullmq';
import { withJobTracing } from '../tracing/bullmq-instrumentation';

const worker = new Worker(
  'my-queue',
  withJobTracing(async (job) => {
    // Job processing is automatically traced
    console.log('Processing job:', job.id);
    return { success: true };
  }),
  { connection: redisConnection }
);
```

#### Option 2: Instrument Worker Events

```typescript
import { Worker } from 'bullmq';
import { instrumentWorker } from '../tracing/bullmq-instrumentation';

const worker = new Worker('my-queue', async (job) => {
  // Job logic
}, { connection });

// Add tracing event listeners
instrumentWorker(worker);
```

#### Option 3: Instrument Queue (Job Enqueueing)

```typescript
import { Queue } from 'bullmq';
import { instrumentQueue } from '../tracing/bullmq-instrumentation';

const queue = new Queue('my-queue', { connection });

// Trace all job additions
instrumentQueue(queue);

// Now when you add jobs, they're traced
await queue.add('my-job', { data: 'value' });
```

## Testing

### Test Script

Run the test script to generate sample traces:

```bash
cd backend/api
ts-node src/tracing/test-tracing.ts
```

This will:
1. Initialize tracing
2. Create sample HTTP request spans
3. Create sample job processing spans
4. Create nested spans
5. Simulate errors
6. Send all traces to configured exporters

### Verify in Sentry

1. Go to your Sentry project
2. Navigate to **Performance** → **Traces**
3. You should see traces like:
   - `GET /api/campaigns`
   - `job.process:trade.buy.buy-token`
   - Custom spans you created

### Verify in Jaeger (if using OTLP)

1. Start Jaeger locally:
   ```bash
   docker run -d --name jaeger \
     -p 4318:4318 \
     -p 16686:16686 \
     jaegertracing/all-in-one:latest
   ```

2. Set environment variable:
   ```env
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
   ```

3. View traces at: http://localhost:16686

## Span Attributes

### HTTP Spans (Auto-instrumented)

```
Span: GET /api/campaigns
Attributes:
  - http.method: GET
  - http.url: /api/campaigns
  - http.status_code: 200
  - http.user_agent: ...
  - service.name: volume-bot-api
```

### BullMQ Job Spans

```
Span: job.process:trade.buy.buy-token
Attributes:
  - messaging.system: bullmq
  - messaging.operation: process
  - messaging.destination: trade.buy
  - job.id: 123
  - job.name: buy-token
  - job.attempt: 1
  - job.data: {...}
```

### Database Query Spans (Auto-instrumented)

```
Span: SELECT campaigns
Attributes:
  - db.system: postgresql
  - db.name: postgres
  - db.statement: SELECT * FROM campaigns WHERE user_id = $1
```

## Performance

### Sampling

Adjust `SENTRY_TRACES_SAMPLE_RATE` to control the percentage of traces sent to Sentry:

```env
# 100% sampling (all traces) - use for development
SENTRY_TRACES_SAMPLE_RATE=1.0

# 10% sampling (recommended for production)
SENTRY_TRACES_SAMPLE_RATE=0.1

# 1% sampling (high-traffic production)
SENTRY_TRACES_SAMPLE_RATE=0.01
```

### Overhead

OpenTelemetry adds minimal overhead:
- **HTTP requests**: ~1-2ms
- **Job processing**: ~0.5-1ms
- **Manual spans**: ~0.1-0.5ms

The auto-instrumentation uses highly optimized code and async exporters to minimize impact.

### Disabling Tracing

```env
# Completely disable tracing
OTEL_ENABLED=false
```

## Troubleshooting

### No traces appearing in Sentry

1. Check `SENTRY_DSN` is set correctly
2. Check `SENTRY_TRACES_SAMPLE_RATE` > 0
3. Check Sentry project has Performance enabled
4. Check logs for OpenTelemetry initialization messages

### No traces appearing in Jaeger

1. Check `OTEL_EXPORTER_OTLP_ENDPOINT` is set
2. Verify Jaeger is running and accessible
3. Check for connection errors in logs
4. Try `curl http://localhost:4318/v1/traces` to verify endpoint

### High memory usage

1. Reduce `SENTRY_TRACES_SAMPLE_RATE`
2. Disable auto-instrumentation for specific libraries in `init.ts`
3. Limit span attributes size (especially job data)

### Spans not connecting (broken traces)

1. Ensure context propagation is working
2. Check that async operations use proper context
3. Verify BullMQ jobs are using `withJobTracing()`

## Best Practices

### Do's

✅ Use auto-instrumentation for HTTP, DB, Redis
✅ Add `@Trace()` to business logic methods
✅ Use `withSpan()` for complex operations
✅ Add meaningful span attributes
✅ Keep span attribute values small (<1KB)
✅ Use sampling in production

### Don'ts

❌ Don't manually create spans for HTTP requests (auto-instrumented)
❌ Don't add sensitive data as span attributes (passwords, keys, etc.)
❌ Don't create too many spans (>100 per request)
❌ Don't log large objects as attributes
❌ Don't use 100% sampling in high-traffic production

## References

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [OpenTelemetry Node.js SDK](https://github.com/open-telemetry/opentelemetry-js)
- [Sentry OpenTelemetry](https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/)
- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
