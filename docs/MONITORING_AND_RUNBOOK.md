# Monitoring and Runbook Guide

This document provides comprehensive guidance for monitoring the Solana Volume Bot system, setting up observability tools, and operational runbooks for common scenarios.

## Table of Contents

- [System Monitoring](#system-monitoring)
- [Observability Stack](#observability-stack)
- [Metrics and Alerting](#metrics-and-alerting)
- [Operational Runbooks](#operational-runbooks)
- [Incident Response](#incident-response)
- [Troubleshooting Guide](#troubleshooting-guide)

---

## System Monitoring

### Built-in Metrics Endpoints

The API exposes several admin endpoints for system monitoring (requires admin JWT authentication):

#### System Metrics
```bash
GET /v1/admin/metrics/system
Authorization: Bearer <ADMIN_JWT>
```

**Returns:**
- API health status, uptime, memory, CPU usage
- Database health and response time
- Redis health, memory usage, connected clients
- Queue statistics
- Worker statistics

**Example:**
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3001/v1/admin/metrics/system
```

#### Queue Metrics
```bash
GET /v1/admin/metrics/queues?timeRange=24h
Authorization: Bearer <ADMIN_JWT>
```

**Parameters:**
- `timeRange`: `1h`, `24h`, `7d`, `30d` (default: `24h`)

**Returns:**
- Job counts (waiting, active, completed, failed, delayed)
- Queue paused status
- Average processing time
- Failure rate

**Example:**
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:3001/v1/admin/metrics/queues?timeRange=1h"
```

#### RPC Provider Metrics
```bash
GET /v1/admin/metrics/rpc
Authorization: Bearer <ADMIN_JWT>
```

**Returns:**
- RPC provider health status
- Latency measurements
- Success rate
- Last health check timestamp

#### Health Check Endpoint
```bash
GET /v1/health
```

**Returns:**
- Simple health status (no authentication required)
- Useful for load balancer health checks

### Redis Connection Monitoring

Monitor Redis connection pool health:

**Location:** `backend/api/src/config/redis.config.ts`

**Key metrics:**
- Connection status (`ready`, `connecting`, `reconnecting`, `end`)
- Command queue length
- Offline queue length

**Get pool statistics programmatically:**
```typescript
import { getRedisPoolStats } from './config/redis.config';

const stats = await getRedisPoolStats();
console.log(stats);
// {
//   connected: true,
//   status: 'ready',
//   commandQueueLength: 0,
//   offlineQueueLength: 0
// }
```

---

## Observability Stack

### OpenTelemetry Tracing

The application is instrumented with OpenTelemetry for distributed tracing.

**Configuration (environment variables):**

```bash
# Enable/disable tracing (default: enabled)
OTEL_ENABLED=true

# Service name for traces
OTEL_SERVICE_NAME=volume-bot-api

# OTLP endpoint (for Jaeger, Tempo, Grafana Cloud, etc.)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Optional: OTLP headers for authentication
OTEL_EXPORTER_OTLP_HEADERS=x-api-key=your-key,x-org-id=your-org
```

**Supported OTLP backends:**
- [Jaeger](https://www.jaegertracing.io/)
- [Grafana Tempo](https://grafana.com/oss/tempo/)
- [Grafana Cloud](https://grafana.com/products/cloud/)
- [Honeycomb](https://www.honeycomb.io/)
- [New Relic](https://newrelic.com/)
- [Datadog](https://www.datadoghq.com/)

**What is traced:**
- HTTP requests and responses
- Database queries (PostgreSQL/Supabase)
- Redis operations
- Express middleware
- Custom application spans

**Auto-instrumentation:**
OpenTelemetry automatically instruments:
- HTTP client/server requests
- Express.js routes
- PostgreSQL queries
- Redis/ioredis operations

### Sentry Error Tracking

Sentry integration provides error tracking, performance monitoring, and alerting.

**Configuration:**

```bash
# Sentry DSN (enables Sentry integration)
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Environment name (development, staging, production)
SENTRY_ENVIRONMENT=production

# Trace sampling rate (0.0 - 1.0)
# 0.1 = 10% of transactions are traced
SENTRY_TRACES_SAMPLE_RATE=0.1
```

**Features:**
- Automatic error capture and reporting
- Performance transaction tracing
- Breadcrumb tracking
- Release tracking
- User context
- Integration with OpenTelemetry traces

**Access Sentry:**
1. Log into [sentry.io](https://sentry.io)
2. Navigate to your project
3. View errors, performance, and alerts

**Setup Sentry Alerts:**
1. Project Settings → Alerts
2. Create alerts for:
   - Error frequency thresholds
   - Performance degradation
   - Crash rate increases
   - Custom metric thresholds

### Logging

Structured JSON logging using Pino.

**Configuration:**

```bash
# Log level: debug, info, warn, error
LOG_LEVEL=info

# Environment affects log formatting
NODE_ENV=production  # JSON logs
NODE_ENV=development # Pretty-printed logs
```

**Log locations:**
- **Docker Compose:** `docker-compose logs -f api worker`
- **Kubernetes:** `kubectl logs -f deployment/api -n volume-bot`
- **Local development:** Console output

**Log aggregation recommendations:**
- [Grafana Loki](https://grafana.com/oss/loki/)
- [ELK Stack](https://www.elastic.co/elastic-stack) (Elasticsearch, Logstash, Kibana)
- [Datadog](https://www.datadoghq.com/)
- [New Relic](https://newrelic.com/)
- [AWS CloudWatch Logs](https://aws.amazon.com/cloudwatch/)

---

## Metrics and Alerting

### Recommended Monitoring Setup

#### Option 1: Grafana Cloud (Easiest)

**Advantages:**
- Managed service, no infrastructure
- Includes Grafana, Prometheus, Loki, Tempo
- Free tier available
- Built-in alerting

**Setup:**
1. Sign up at [grafana.com](https://grafana.com/products/cloud/)
2. Configure OTLP exporter:
   ```bash
   OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-us-central-0.grafana.net/otlp
   OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64_encoded_token>
   ```
3. View traces in Grafana Cloud Tempo
4. Set up dashboards and alerts

#### Option 2: Self-Hosted Prometheus + Grafana

**Advantages:**
- Full control
- Cost-effective for large scale
- Can run on-premise

**Docker Compose setup:**

Create `monitoring-stack.yml`:

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
    depends_on:
      - prometheus

  alertmanager:
    image: prom/alertmanager:latest
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml
      - alertmanager_data:/alertmanager

  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    volumes:
      - loki_data:/loki

  tempo:
    image: grafana/tempo:latest
    ports:
      - "3200:3200"  # Tempo
      - "4318:4318"  # OTLP HTTP
    volumes:
      - tempo_data:/tmp/tempo

volumes:
  prometheus_data:
  grafana_data:
  alertmanager_data:
  loki_data:
  tempo_data:
```

**Start monitoring stack:**
```bash
docker-compose -f monitoring-stack.yml up -d
```

**Configure application to send traces:**
```bash
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318
```

#### Option 3: Kubernetes Native Monitoring

If using Kubernetes, install the monitoring stack using Helm:

```bash
# Add Prometheus community Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install kube-prometheus-stack (Prometheus + Grafana + Alertmanager)
helm install kube-prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace

# Install Tempo for traces
helm repo add grafana https://grafana.github.io/helm-charts
helm install tempo grafana/tempo --namespace monitoring

# Install Loki for logs
helm install loki grafana/loki-stack --namespace monitoring
```

### Key Metrics to Monitor

#### Application Metrics

| Metric | Threshold | Alert Condition |
|--------|-----------|----------------|
| API Response Time | < 500ms | Alert if p95 > 1s |
| Error Rate | < 1% | Alert if > 5% |
| Queue Wait Time | < 30s | Alert if > 2 minutes |
| Queue Failure Rate | < 2% | Alert if > 10% |
| Worker Processing Time | < 10s/job | Alert if > 30s |
| Active Campaigns | N/A | Monitor for sudden drops |

#### Infrastructure Metrics

| Metric | Threshold | Alert Condition |
|--------|-----------|----------------|
| CPU Usage | < 70% | Alert if > 90% for 5+ min |
| Memory Usage | < 80% | Alert if > 95% for 5+ min |
| Redis Memory | < 80% | Alert if > 90% |
| Redis Connection Count | < 100 | Alert if > 500 |
| Disk Usage | < 80% | Alert if > 90% |
| Network Bandwidth | N/A | Alert if saturated |

#### Solana-Specific Metrics

| Metric | Threshold | Alert Condition |
|--------|-----------|----------------|
| RPC Latency | < 200ms | Alert if > 1s |
| RPC Success Rate | > 95% | Alert if < 90% |
| Transaction Success Rate | > 90% | Alert if < 80% |
| Wallet Balance | N/A | Alert if critically low |
| Jito Bundle Success Rate | > 85% | Alert if < 70% |

### Alert Configuration Examples

#### Prometheus Alert Rules

Create `prometheus-alerts.yml`:

```yaml
groups:
  - name: volume-bot-alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} (threshold: 5%)"

      - alert: HighQueueBacklog
        expr: queue_waiting_jobs > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High queue backlog"
          description: "{{ $value }} jobs waiting in queue"

      - alert: WorkerDown
        expr: up{job="volume-bot-worker"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Worker is down"
          description: "Worker instance {{ $labels.instance }} is down"

      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes / 1024 / 1024 > 1024
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}MB (threshold: 1GB)"

      - alert: RPCProviderDown
        expr: rpc_health_status == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "RPC provider is down"
          description: "RPC provider {{ $labels.provider }} is unreachable"
```

#### Grafana Dashboard

Import pre-built dashboard or create custom dashboard with panels for:

1. **API Health Panel:**
   - Request rate
   - Error rate
   - Response time (p50, p95, p99)
   - Active connections

2. **Queue Health Panel:**
   - Jobs waiting/active/completed/failed
   - Processing time histogram
   - Throughput (jobs/sec)
   - Queue depth over time

3. **Worker Health Panel:**
   - Worker count
   - CPU/Memory per worker
   - Job processing rate
   - Error count

4. **Database Health Panel:**
   - Query response time
   - Connection pool usage
   - Slow queries

5. **Redis Health Panel:**
   - Memory usage
   - Connection count
   - Command rate
   - Hit rate

6. **RPC Provider Panel:**
   - Latency per provider
   - Success rate
   - Failover events

---

## Operational Runbooks

### Runbook 1: High Queue Backlog

**Symptoms:**
- Queue waiting jobs > 1000
- Slow campaign execution
- Dashboard shows delays

**Diagnosis:**
```bash
# Check queue metrics
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3001/v1/admin/metrics/queues

# Check worker count
# Docker:
docker-compose ps worker
# Kubernetes:
kubectl get pods -n volume-bot -l component=worker
```

**Resolution:**

1. **Scale up workers:**
   ```bash
   # Docker Compose:
   ./scripts/scale-workers.sh docker 10

   # Kubernetes:
   kubectl scale deployment worker --replicas=10 -n volume-bot
   ```

2. **Check for stuck jobs:**
   ```bash
   # Access Redis CLI
   redis-cli

   # Check queue lengths
   > LLEN bull:campaign-executor:wait
   > LLEN bull:campaign-executor:active
   > LLEN bull:campaign-executor:failed
   ```

3. **Restart stuck workers (if needed):**
   ```bash
   # Docker:
   docker-compose restart worker

   # Kubernetes:
   kubectl rollout restart deployment/worker -n volume-bot
   ```

4. **Monitor recovery:**
   ```bash
   watch -n 5 'curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
     http://localhost:3001/v1/admin/metrics/queues | jq .queues'
   ```

**Prevention:**
- Set up auto-scaling (HPA for Kubernetes)
- Monitor queue depth proactively
- Alert on queue backlog > 500

---

### Runbook 2: Database Connection Pool Exhausted

**Symptoms:**
- API requests timing out
- Errors: "Connection pool exhausted"
- High database connection count

**Diagnosis:**
```bash
# Check system metrics
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3001/v1/admin/metrics/system

# Check Supabase dashboard
# Navigate to: Project → Database → Connection pooling
```

**Resolution:**

1. **Increase connection pool size:**

   Edit Supabase connection settings or use PgBouncer:
   ```bash
   # Update SUPABASE_URL to use connection pooler:
   # Change from: https://xxx.supabase.co
   # To: postgres://postgres:password@db.xxx.supabase.co:5432/postgres
   ```

2. **Identify slow queries:**
   ```sql
   -- In Supabase SQL Editor:
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query
   FROM pg_stat_activity
   WHERE state = 'active'
   ORDER BY duration DESC;
   ```

3. **Kill long-running queries (if necessary):**
   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE pid = <pid>;
   ```

4. **Restart API to reset connections:**
   ```bash
   # Docker:
   docker-compose restart api

   # Kubernetes:
   kubectl rollout restart deployment/api -n volume-bot
   ```

**Prevention:**
- Optimize slow queries
- Implement query timeout limits
- Use connection pooling (PgBouncer)
- Monitor connection pool usage

---

### Runbook 3: Redis Connection Issues

**Symptoms:**
- "Redis connection refused" errors
- Workers not processing jobs
- Rate limiting not working

**Diagnosis:**
```bash
# Check Redis connectivity
redis-cli -u $REDIS_URL ping

# Check Redis memory
redis-cli -u $REDIS_URL INFO memory

# Check Redis logs
# Docker:
docker-compose logs redis
# Kubernetes:
kubectl logs -n volume-bot deployment/redis
```

**Resolution:**

1. **Check Redis is running:**
   ```bash
   # Docker:
   docker-compose ps redis
   docker-compose up -d redis

   # Kubernetes:
   kubectl get pods -n volume-bot -l app=redis
   kubectl describe pod redis-xxx -n volume-bot
   ```

2. **Verify Redis credentials:**
   ```bash
   # Test connection
   redis-cli -u $REDIS_URL
   > AUTH <password>
   > PING
   ```

3. **Check Redis memory:**
   ```bash
   redis-cli -u $REDIS_URL INFO memory

   # If memory is full, clear expired keys:
   redis-cli -u $REDIS_URL --scan --pattern '*' | \
     xargs redis-cli -u $REDIS_URL DEL
   ```

4. **Restart API and workers:**
   ```bash
   docker-compose restart api worker
   ```

**Prevention:**
- Set Redis maxmemory policy: `maxmemory-policy allkeys-lru`
- Monitor Redis memory usage
- Set up Redis replication for high availability
- Use Redis Cluster for horizontal scaling

---

### Runbook 4: High RPC Latency / Failures

**Symptoms:**
- Slow transaction processing
- Transaction failures
- RPC timeout errors

**Diagnosis:**
```bash
# Check RPC metrics
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3001/v1/admin/metrics/rpc

# Test RPC endpoint manually
curl -X POST $SOLANA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

**Resolution:**

1. **Switch to backup RPC endpoint:**
   ```bash
   # Update environment variable
   export SOLANA_RPC_URL=https://backup-rpc-endpoint.com

   # Restart services
   docker-compose restart api worker
   ```

2. **Use multiple RPC providers (load balancing):**

   Configure fallback RPC endpoints in code:
   ```typescript
   const rpcEndpoints = [
     process.env.SOLANA_RPC_URL,
     process.env.SOLANA_RPC_URL_BACKUP,
     'https://api.mainnet-beta.solana.com', // Public fallback
   ];
   ```

3. **Check RPC provider status:**
   - Helius: [status.helius.dev](https://status.helius.dev)
   - QuickNode: Check dashboard
   - Public endpoints: [status.solana.com](https://status.solana.com)

4. **Reduce request rate:**
   ```bash
   # Temporarily pause campaigns
   # Use admin API to pause campaigns
   ```

**Prevention:**
- Use dedicated RPC provider (Helius, QuickNode)
- Configure multiple RPC endpoints with failover
- Monitor RPC latency and success rate
- Set up alerts for RPC degradation

---

### Runbook 5: Worker Process Crash Loop

**Symptoms:**
- Worker pods/containers restarting repeatedly
- CrashLoopBackOff status (Kubernetes)
- "Exited with code 1" errors

**Diagnosis:**
```bash
# Check worker logs
# Docker:
docker-compose logs --tail=100 worker

# Kubernetes:
kubectl logs -n volume-bot deployment/worker --tail=100
kubectl logs -n volume-bot <pod-name> --previous  # Previous crash logs
```

**Resolution:**

1. **Identify the error:**
   - Look for error messages in logs
   - Check for uncaught exceptions
   - Verify environment variables are set

2. **Common issues and fixes:**

   **Missing environment variables:**
   ```bash
   # Verify all required env vars are set
   docker-compose config
   kubectl get configmap -n volume-bot -o yaml
   ```

   **Memory limit exceeded:**
   ```yaml
   # Increase memory limit in docker-compose.yml or k8s deployment
   resources:
     limits:
       memory: 2Gi  # Increase from 1Gi
   ```

   **Unhandled promise rejection:**
   - Check application code for unhandled promises
   - Add global error handlers

3. **Restart with debug logging:**
   ```bash
   # Set LOG_LEVEL=debug
   # Docker:
   docker-compose up -d worker

   # Kubernetes:
   kubectl set env deployment/worker LOG_LEVEL=debug -n volume-bot
   ```

4. **Rollback to previous version (if recent deployment):**
   ```bash
   # Docker:
   docker-compose down
   docker pull volume-bot-worker:v1.0.0  # Previous version
   docker-compose up -d

   # Kubernetes:
   kubectl rollout undo deployment/worker -n volume-bot
   ```

**Prevention:**
- Implement proper error handling
- Add health checks with appropriate timeouts
- Test deployments in staging first
- Use gradual rollouts (canary deployments)

---

### Runbook 6: Campaign Not Executing

**Symptoms:**
- Campaign status shows "active" but no transactions
- No job processing logs
- Campaign appears stuck

**Diagnosis:**
```bash
# Get campaign details
curl -H "Authorization: Bearer $JWT_TOKEN" \
  http://localhost:3001/v1/campaigns/<campaign-id>

# Check queue for campaign jobs
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3001/v1/admin/metrics/queues

# Check worker logs for specific campaign
# Docker:
docker-compose logs worker | grep "campaign-id"
```

**Resolution:**

1. **Verify campaign status in database:**
   ```sql
   -- In Supabase SQL Editor:
   SELECT * FROM campaigns WHERE id = '<campaign-id>';
   ```

2. **Check wallet balance:**
   ```sql
   SELECT * FROM wallets WHERE id = (
     SELECT wallet_id FROM campaigns WHERE id = '<campaign-id>'
   );
   ```

   If balance is low, fund the wallet.

3. **Restart campaign:**
   ```bash
   # Stop campaign
   curl -X PATCH -H "Authorization: Bearer $JWT_TOKEN" \
     http://localhost:3001/v1/campaigns/<campaign-id>/stop

   # Start campaign again
   curl -X PATCH -H "Authorization: Bearer $JWT_TOKEN" \
     http://localhost:3001/v1/campaigns/<campaign-id>/start
   ```

4. **Check for job failures:**
   ```bash
   # Get failed jobs from queue
   redis-cli
   > ZRANGE bull:campaign-executor:failed 0 -1 WITHSCORES
   ```

5. **Retry failed jobs:**
   ```bash
   # Use BullMQ UI or admin API to retry failed jobs
   # Or manually in Redis:
   redis-cli
   > ZREM bull:campaign-executor:failed <job-id>
   > RPUSH bull:campaign-executor:wait <job-data>
   ```

**Prevention:**
- Monitor wallet balances
- Set up low balance alerts
- Implement automatic job retry logic
- Add better error handling in workers

---

## Incident Response

### Severity Levels

| Severity | Definition | Response Time | Escalation |
|----------|------------|--------------|------------|
| **P0 - Critical** | Complete service outage | 15 minutes | Immediately page on-call |
| **P1 - High** | Major functionality impaired | 1 hour | Notify on-call within 15 min |
| **P2 - Medium** | Partial functionality impaired | 4 hours | Notify during business hours |
| **P3 - Low** | Minor issue, workaround available | 1 business day | Create ticket |

### Incident Response Checklist

#### 1. **Acknowledge**
- [ ] Acknowledge alert in monitoring system
- [ ] Join incident channel (Slack, Discord, etc.)
- [ ] Assign incident commander

#### 2. **Assess**
- [ ] Check system metrics dashboard
- [ ] Review recent deployments
- [ ] Check external service status pages
- [ ] Determine severity level

#### 3. **Communicate**
- [ ] Post initial status update
- [ ] Notify affected users (if customer-facing)
- [ ] Set up status page update

#### 4. **Mitigate**
- [ ] Follow relevant runbook
- [ ] Implement temporary workaround if possible
- [ ] Document all actions taken

#### 5. **Resolve**
- [ ] Apply permanent fix
- [ ] Verify system is healthy
- [ ] Monitor for 30 minutes post-fix

#### 6. **Document**
- [ ] Write incident report
- [ ] Document timeline
- [ ] List action items

#### 7. **Post-Mortem**
- [ ] Schedule post-mortem meeting
- [ ] Identify root cause
- [ ] Create prevention tasks
- [ ] Update runbooks

### Escalation Contacts

Create a file `ESCALATION_CONTACTS.md` (not in git) with:

```markdown
## On-Call Rotation

- Week 1: Engineer A (phone: xxx-xxx-xxxx, email: a@example.com)
- Week 2: Engineer B (phone: xxx-xxx-xxxx, email: b@example.com)

## Escalation Path

1. On-call engineer (15 min response time)
2. Engineering manager (if no response in 30 min)
3. CTO / VP Engineering (if no response in 1 hour)

## External Contacts

- Helius Support: support@helius.dev
- Supabase Support: support@supabase.com
- Sentry Support: support@sentry.io
```

---

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue: "Cannot connect to Supabase"

**Symptoms:** `ECONNREFUSED` errors, database timeouts

**Solutions:**
1. Verify `SUPABASE_URL` is correct
2. Check Supabase project is not paused (free tier)
3. Verify API keys are valid
4. Test network connectivity: `curl https://your-project.supabase.co`

---

#### Issue: "Redis READONLY error"

**Symptoms:** "READONLY You can't write against a read only replica"

**Solutions:**
1. Check Redis replication status: `redis-cli INFO replication`
2. Verify you're connecting to master, not replica
3. If using Redis Sentinel, check master election status

---

#### Issue: "Transaction signature verification failure"

**Symptoms:** Solana transactions failing with signature errors

**Solutions:**
1. Check wallet private key is correct
2. Verify wallet has sufficient SOL for transaction fees
3. Check RPC endpoint is in sync with network
4. Try different RPC provider

---

#### Issue: "Memory leak in worker"

**Symptoms:** Worker memory usage continuously growing

**Solutions:**
1. Enable heap snapshots for analysis
2. Check for unclosed database connections
3. Look for event listener leaks
4. Review job data size - large payloads cause issues
5. Restart workers periodically as workaround

---

#### Issue: "High CPU usage"

**Symptoms:** CPU at 100%, system slow

**Solutions:**
1. Check for infinite loops in code
2. Look for heavy cryptographic operations
3. Verify not processing too many jobs concurrently
4. Reduce `WORKER_CONCURRENCY` setting
5. Scale horizontally instead of vertically

---

### Debug Mode

Enable detailed debug logging:

```bash
# Set environment variable
LOG_LEVEL=debug

# Restart services
docker-compose restart api worker

# Tail logs
docker-compose logs -f api worker
```

---

## Best Practices

### Monitoring Best Practices

1. **Alert on symptoms, not causes**
   - Alert on "API response time > 1s" not "CPU > 80%"
   - Alert on "Queue backlog > 1000" not "Worker count < 5"

2. **Avoid alert fatigue**
   - Set appropriate thresholds
   - Use alert grouping
   - Implement alert snoozing for known issues

3. **Monitor the right metrics**
   - Focus on user-facing metrics first
   - Monitor all external dependencies
   - Track business metrics (campaigns executed, transactions sent)

4. **Implement health checks**
   - Deep health checks (not just "is process running")
   - Check all critical dependencies
   - Use health checks for automated recovery

5. **Regular review**
   - Review alerts weekly
   - Update runbooks based on incidents
   - Conduct fire drills

### Operational Best Practices

1. **Gradual rollouts**
   - Deploy to staging first
   - Use canary deployments
   - Monitor closely post-deployment

2. **Capacity planning**
   - Monitor growth trends
   - Plan for 2-3x current capacity
   - Load test before major events

3. **Backup and recovery**
   - Regular database backups
   - Test restore procedures
   - Document recovery steps

4. **Documentation**
   - Keep runbooks up to date
   - Document all architectural decisions
   - Maintain deployment procedures

5. **Chaos engineering**
   - Regularly test failure scenarios
   - Practice incident response
   - Identify weaknesses proactively

---

## Additional Resources

- [Deployment Guide](./DEPLOYMENT.md)
- [Environment Setup Guide](./ENVIRONMENT_SETUP.md)
- [API Documentation](http://localhost:3001/api-docs)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Sentry Documentation](https://docs.sentry.io/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Documentation](https://redis.io/documentation)

---

**Last Updated:** 2025-10-14
