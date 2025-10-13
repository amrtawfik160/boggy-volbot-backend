# Logging Configuration

This document describes the structured logging implementation using Pino and log aggregation options.

## Overview

The application uses [Pino](https://getpino.io/) for structured JSON logging with contextual fields for tracing requests, jobs, and user actions across the distributed system.

## Key Features

- **Structured JSON logging** - All logs are emitted as JSON for easy parsing and querying
- **Contextual logging** - Automatic inclusion of context fields (userId, campaignId, jobId, requestId)
- **Multiple transports** - Support for pretty-print (development), CloudWatch (production), or stdout JSON (container logging)
- **Child loggers** - Easy creation of scoped loggers with inherited context
- **Performance** - Minimal overhead with efficient serialization

## Usage

### Basic Logger Creation

```typescript
import { createLogger } from './config/logger';

const logger = createLogger({ name: 'my-service' });

logger.info('Service started');
logger.error({ error }, 'Operation failed');
```

### Contextual Logging

Create child loggers with context fields that are automatically included in all log statements:

```typescript
import { createLogger, createChildLogger } from './config/logger';

const logger = createLogger({ name: 'campaigns' });

// Add context for a specific operation
const contextLogger = createChildLogger(logger, {
  userId: user.id,
  campaignId: campaign.id,
  requestId: req.requestId,
});

contextLogger.info('Starting campaign'); // Includes userId, campaignId, requestId
contextLogger.error({ error }, 'Campaign failed'); // Context included automatically
```

### Request Context Middleware

The API automatically attaches a unique `requestId` to every HTTP request via the `RequestContextMiddleware`:

```typescript
import { RequestId } from './decorators/request-id.decorator';

@Get(':id')
async getCampaign(
  @Param('id') id: string,
  @CurrentUser() user: any,
  @RequestId() requestId: string
) {
  const logger = createChildLogger(this.logger, {
    userId: user.id,
    campaignId: id,
    requestId,
  });

  logger.info('Fetching campaign');
  // ...
}
```

### Worker Job Context

Workers automatically include job context in their logging:

```typescript
protected async execute(data: JobData, context: JobContext): Promise<JobResult> {
  // context.logger already includes jobId, campaignId, etc.
  context.logger.info({ amount: data.amount }, 'Processing job');

  // Create additional context as needed
  const txLogger = createChildLogger(context.logger, {
    transactionId: tx.signature,
  });

  txLogger.info('Transaction confirmed');
}
```

## Log Levels

Configure the minimum log level via the `LOG_LEVEL` environment variable:

- `debug` - Detailed debugging information
- `info` - General informational messages (default)
- `warn` - Warning messages
- `error` - Error messages

```bash
LOG_LEVEL=debug npm start
```

## Log Transports

The logger automatically selects the appropriate transport based on the environment:

### Development (NODE_ENV=development)

Uses `pino-pretty` for human-readable colored output:

```
[10:30:45] INFO (api): Service started
  env: "development"
  service: "api"
```

### Production - CloudWatch (Optional)

Configure CloudWatch log streaming by setting these environment variables:

```bash
CLOUDWATCH_LOG_GROUP=/aws/application/boggy-bot
CLOUDWATCH_LOG_STREAM=production-api
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

Logs will be automatically batched and sent to CloudWatch Logs every second.

### Production - Stdout JSON (Default)

If CloudWatch variables are not set, logs are written as JSON to stdout:

```json
{"level":"info","time":"2025-01-13T10:30:45.123Z","name":"api","env":"production","msg":"Service started"}
```

This is ideal for container environments where log collection agents (Datadog, Fluentd, etc.) read from container stdout.

## Log Aggregation Options

### Option 1: CloudWatch (Direct)

**Pros:**
- Direct integration via pino-cloudwatch
- No additional infrastructure needed
- Built-in retention and querying via CloudWatch Logs Insights

**Cons:**
- Requires AWS credentials in application
- Additional AWS costs for log storage
- Limited querying capabilities compared to specialized tools

**Setup:**
Set environment variables as shown above. The application will automatically stream logs to CloudWatch.

### Option 2: Datadog Agent (Recommended for Production)

**Pros:**
- Best-in-class log analysis and APM
- No application changes needed (reads stdout)
- Advanced querying, dashboards, and alerting
- Unified observability (logs + metrics + traces)

**Cons:**
- Requires Datadog agent deployment
- Additional cost for Datadog service

**Setup:**

1. Deploy Datadog agent in your container environment
2. Configure agent to read container logs
3. Set up log parsing rules in Datadog UI
4. No application environment variables needed

**Docker Compose Example:**

```yaml
services:
  api:
    build: ./backend/api
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      # No CloudWatch vars = stdout JSON
    labels:
      com.datadoghq.ad.logs: '[{"source":"nodejs","service":"boggy-bot-api"}]'

  datadog-agent:
    image: gcr.io/datadoghq/agent:latest
    environment:
      - DD_API_KEY=${DD_API_KEY}
      - DD_LOGS_ENABLED=true
      - DD_LOGS_CONFIG_CONTAINER_COLLECT_ALL=true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /proc/:/host/proc/:ro
      - /sys/fs/cgroup/:/host/sys/fs/cgroup:ro
```

### Option 3: Fluentd/Elasticsearch/Kibana (EFK)

**Pros:**
- Self-hosted option (no external service costs)
- Full control over data and retention
- Powerful querying with Elasticsearch

**Cons:**
- Requires managing additional infrastructure
- More complex setup and maintenance

**Setup:**
Deploy Fluentd agent to collect container logs and forward to Elasticsearch. No application changes needed.

## Context Fields

Standard context fields automatically included when using child loggers:

| Field | Description | Example |
|-------|-------------|---------|
| `userId` | Authenticated user ID | `"550e8400-e29b-41d4-a716-446655440000"` |
| `campaignId` | Campaign identifier | `"camp_123abc"` |
| `jobId` | BullMQ job ID | `"42"` |
| `requestId` | Unique request identifier | `"req_9f1d2e3b"` |
| `walletId` | Solana wallet public key | `"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJ"` |
| `dbJobId` | Database job record ID | `"123"` |

Additional context fields can be added as needed using the `createChildLogger` function.

## Best Practices

### 1. Use Contextual Loggers

Always create child loggers with relevant context:

```typescript
// Good
const logger = createChildLogger(this.logger, { userId, campaignId });
logger.info('Operation started');

// Avoid
this.logger.info({ userId, campaignId }, 'Operation started');
```

### 2. Log Structured Data

Include relevant data as separate fields, not in the message:

```typescript
// Good
logger.info({ amount, token, wallet }, 'Trade executed');

// Avoid
logger.info(`Trade executed: amount=${amount}, token=${token}`);
```

### 3. Use Appropriate Log Levels

- `debug` - Detailed flow information for debugging
- `info` - Important business events (trade executed, campaign started)
- `warn` - Unexpected but handled situations (retry attempt, degraded mode)
- `error` - Errors that require attention

### 4. Include Error Objects

Always pass error objects as a separate field:

```typescript
// Good
logger.error({ error }, 'Failed to execute trade');

// Avoid
logger.error(`Failed to execute trade: ${error.message}`);
```

### 5. Avoid Sensitive Data

Never log sensitive information:

```typescript
// NEVER DO THIS
logger.info({ privateKey, password, apiKey }, 'User data');

// Do this instead
logger.info({ userId, walletPublicKey }, 'User authenticated');
```

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Error Rate** - Track `level:error` logs
2. **Response Time** - Log request duration in API endpoints
3. **Job Failures** - Monitor worker job failures
4. **Authentication Failures** - Track failed auth attempts

### Sample CloudWatch Insights Queries

```
# Error rate by service
fields @timestamp, level, service, msg
| filter level = "error"
| stats count() by service

# Slow requests
fields @timestamp, requestId, duration
| filter duration > 1000
| sort duration desc

# Campaign activity
fields @timestamp, campaignId, msg
| filter campaignId = "camp_123abc"
| sort @timestamp desc
```

### Sample Datadog Queries

```
# Error rate
status:error service:boggy-bot-api

# Specific user activity
@userId:"550e8400-e29b-41d4-a716-446655440000"

# Campaign traces
@campaignId:"camp_123abc" @level:info
```

## Troubleshooting

### Logs not appearing in CloudWatch

1. Verify AWS credentials are set correctly
2. Check IAM permissions for CloudWatch Logs
3. Ensure log group exists or application has permission to create it
4. Check application logs for pino-cloudwatch errors

### Pretty printing not working in development

1. Ensure `NODE_ENV=development` is set
2. Check that `pino-pretty` is installed: `npm list pino-pretty`
3. Verify no CloudWatch variables are set in development

### High log volume

1. Increase `LOG_LEVEL` to `warn` or `error`
2. Review and reduce debug logging in hot paths
3. Consider sampling high-frequency logs

## Migration Notes

All legacy `console.log` and `console.error` statements have been migrated to Pino. The legacy logger at `workers/src/core/legacy/utils/logger.ts` has been refactored to use Pino internally for backwards compatibility.

## References

- [Pino Documentation](https://getpino.io/)
- [pino-cloudwatch](https://github.com/dbProjectRED/pino-cloudwatch)
- [CloudWatch Logs](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/)
- [Datadog Agent Setup](https://docs.datadoghq.com/agent/)
