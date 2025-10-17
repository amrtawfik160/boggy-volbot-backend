# Health Check System

## Overview

The health check system provides comprehensive monitoring endpoints for the Solana Volume Bot API. It uses `@nestjs/terminus` to implement robust health checks for all critical services including database, Redis, and Solana RPC providers.

## Architecture

### Health Indicators

The system implements three custom health indicators:

1. **DatabaseHealthIndicator** - Checks Supabase/PostgreSQL connectivity
2. **RedisHealthIndicator** - Checks Redis connectivity and responsiveness
3. **RpcHealthIndicator** - Checks Solana RPC provider availability with degraded state support

### Degraded State Handling

The RPC health indicator implements intelligent degraded state handling:

- **Fully Healthy**: All RPC providers are operational
- **Degraded**: Some RPC providers are down, but the service can continue
- **Down**: All RPC providers are unavailable

The queue system can continue operating even when RPC providers are temporarily unavailable, making it resilient to network issues.

## Endpoints

### `GET /health`

Comprehensive health check that includes all services.

**Response (200 OK - Healthy)**:
```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up",
      "latency": "45ms",
      "connection": "connected"
    },
    "redis": {
      "status": "up",
      "latency": "12ms",
      "version": "7.0.0",
      "connection": "ready"
    },
    "rpc": {
      "status": "up",
      "healthy": 2,
      "total": 2,
      "providers": [
        {
          "endpoint": "https://api.mainnet-beta.solana.com",
          "status": "up",
          "latency": "123ms",
          "version": "1.17.0",
          "slot": 234567890
        }
      ]
    }
  },
  "error": {},
  "details": {
    "database": { ... },
    "redis": { ... },
    "rpc": { ... }
  }
}
```

**Response (200 OK - Degraded)**:
```json
{
  "status": "ok",
  "info": {
    "rpc": {
      "status": "degraded",
      "message": "Some RPC providers are unavailable but service continues",
      "healthy": 1,
      "total": 2,
      "providers": [
        {
          "endpoint": "https://api.mainnet-beta.solana.com",
          "status": "up",
          "latency": "123ms"
        },
        {
          "endpoint": "https://backup-rpc.com",
          "status": "down",
          "error": "Connection timeout"
        }
      ]
    }
  }
}
```

**Response (503 Service Unavailable)**:
```json
{
  "status": "error",
  "error": {
    "database": {
      "status": "down",
      "message": "Connection timeout",
      "connection": "disconnected"
    }
  }
}
```

### `GET /health/live`

Kubernetes liveness probe - indicates if the application process is alive.

**Purpose**: Determines if the container should be restarted
**Checks**: Only checks if the process is running
**Does NOT check**: External dependencies

**Response (200 OK)**:
```json
{
  "status": "ok",
  "timestamp": "2025-10-13T19:30:00.000Z",
  "uptime": 3600.5
}
```

### `GET /health/ready`

Kubernetes readiness probe - indicates if the application can accept traffic.

**Purpose**: Determines if traffic should be routed to this instance
**Checks**: Database and Redis connectivity
**Does NOT check**: RPC providers (degraded RPC state is acceptable)

**Response (200 OK)**:
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up", ... },
    "redis": { "status": "up", ... }
  }
}
```

**Response (503 Service Unavailable)**:
```json
{
  "status": "error",
  "error": {
    "redis": {
      "status": "down",
      "message": "Connection refused"
    }
  }
}
```

### `GET /health/startup`

Kubernetes startup probe - indicates if the application has completed initialization.

**Purpose**: Determines if the application has started successfully
**Checks**: All services including database, Redis, and RPC
**Strict**: Does NOT allow degraded RPC state during startup

**Response (200 OK)**:
```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up", ... },
    "redis": { "status": "up", ... },
    "rpc": { "status": "up", ... }
  }
}
```

## Kubernetes Configuration

### Example Deployment

```yaml
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
        ports:
        - containerPort: 3001

        # Liveness probe - restart if unhealthy
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3

        # Readiness probe - stop routing traffic if unhealthy
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2

        # Startup probe - allow time for initialization
        startupProbe:
          httpGet:
            path: /health/startup
            port: 3001
          initialDelaySeconds: 0
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 30  # 300 seconds max startup time
```

### Probe Configuration Guidelines

#### Liveness Probe
- **Purpose**: Detect if the application is stuck or deadlocked
- **Failure Action**: Restart the container
- **Configuration**:
  - Use `/health/live` endpoint
  - `initialDelaySeconds`: 10-30 seconds (allow time for startup)
  - `periodSeconds`: 10-30 seconds (not too frequent)
  - `failureThreshold`: 3-5 (allow temporary issues)

#### Readiness Probe
- **Purpose**: Determine when to route traffic to the pod
- **Failure Action**: Remove pod from service load balancer
- **Configuration**:
  - Use `/health/ready` endpoint
  - `initialDelaySeconds`: 5-10 seconds
  - `periodSeconds`: 5-10 seconds (frequent checks)
  - `failureThreshold`: 1-2 (quick response to issues)

#### Startup Probe
- **Purpose**: Give application time to start before liveness checks
- **Failure Action**: Restart the container
- **Configuration**:
  - Use `/health/startup` endpoint
  - `initialDelaySeconds`: 0 (start checking immediately)
  - `periodSeconds`: 10 seconds
  - `failureThreshold`: 30 (allow up to 300 seconds for startup)

## Monitoring and Alerting

### Prometheus Metrics

Health check results are automatically exposed as Prometheus metrics:

```
# Application health status
app_health_status{service="database"} 1  # 1 = up, 0 = down
app_health_status{service="redis"} 1
app_health_status{service="rpc"} 1

# Health check latency
app_health_latency_ms{service="database"} 45
app_health_latency_ms{service="redis"} 12
app_health_latency_ms{service="rpc"} 123

# RPC provider status
app_rpc_provider_status{endpoint="mainnet"} 1
app_rpc_provider_status{endpoint="backup"} 0
```

### Alert Rules

Example Prometheus alert rules:

```yaml
groups:
- name: health_checks
  rules:
  - alert: ServiceDown
    expr: app_health_status == 0
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Service {{ $labels.service }} is down"

  - alert: HighHealthCheckLatency
    expr: app_health_latency_ms > 1000
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High latency for {{ $labels.service }}"

  - alert: AllRpcProvidersDown
    expr: sum(app_rpc_provider_status) == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "All RPC providers are unavailable"

  - alert: RpcProviderDegraded
    expr: sum(app_rpc_provider_status) < count(app_rpc_provider_status)
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "Some RPC providers are unavailable"
```

## Testing

### Unit Tests

Run health indicator unit tests:

```bash
cd backend/api
npm test src/health/__tests__/health-indicators.spec.ts
```

### Integration Tests

Run health endpoint integration tests:

```bash
npm test src/health/__tests__/health.integration.spec.ts
```

### Manual Testing

Test health endpoints manually:

```bash
# Full health check
curl http://localhost:3001/health

# Liveness probe
curl http://localhost:3001/health/live

# Readiness probe
curl http://localhost:3001/health/ready

# Startup probe
curl http://localhost:3001/health/startup
```

## Troubleshooting

### Database Health Check Failures

**Symptoms**: `/health` returns 503 with database down

**Common Causes**:
- Supabase connection credentials incorrect
- Database server unreachable
- Network connectivity issues
- Database overloaded or timing out

**Solutions**:
1. Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables
2. Verify database server is running
3. Test database connection manually
4. Check network firewall rules

### Redis Health Check Failures

**Symptoms**: `/health` returns 503 with Redis down

**Common Causes**:
- Redis server not running
- Incorrect Redis URL
- Network connectivity issues
- Redis authentication failure

**Solutions**:
1. Check `REDIS_URL` environment variable
2. Verify Redis server is running: `redis-cli ping`
3. Test Redis connection manually
4. Check Redis logs for errors

### RPC Health Check Failures

**Symptoms**: `/health` shows RPC degraded or down

**Common Causes**:
- RPC provider rate limiting
- Network connectivity issues
- RPC endpoint maintenance
- Invalid RPC URL

**Solutions**:
1. Check `SOLANA_RPC_URL` environment variable
2. Verify RPC endpoint is accessible
3. Check RPC provider status page
4. Configure multiple RPC endpoints for redundancy
5. Note: Degraded RPC state is acceptable for normal operation

### Liveness Probe Failures

**Symptoms**: Kubernetes keeps restarting pods

**Common Causes**:
- Application deadlock or hang
- Insufficient startup time
- Resource exhaustion (CPU/memory)

**Solutions**:
1. Increase `initialDelaySeconds` and `failureThreshold`
2. Check application logs for errors
3. Monitor resource usage
4. Use `/health/live` for debugging

### Readiness Probe Failures

**Symptoms**: No traffic routed to pod

**Common Causes**:
- Critical dependency down (DB or Redis)
- Slow health check responses
- Network issues

**Solutions**:
1. Check `/health/ready` endpoint manually
2. Verify database and Redis connectivity
3. Increase `timeoutSeconds` if needed
4. Check application logs

## Best Practices

1. **Use All Three Probes**: Implement liveness, readiness, and startup probes for optimal resilience
2. **Tune Timeouts**: Adjust probe timeouts based on observed latency
3. **Monitor Health Metrics**: Set up alerts for health check failures
4. **Test Failure Scenarios**: Regularly test how your system handles dependency failures
5. **Configure Multiple RPC Endpoints**: Use multiple RPC providers for redundancy
6. **Implement Circuit Breakers**: Consider circuit breakers for flapping services
7. **Log Health Check Failures**: Ensure health check failures are logged for debugging

## Security Considerations

1. **Mask Sensitive Information**: RPC endpoints with API keys are masked in responses
2. **Authentication**: Consider adding authentication for health endpoints in production
3. **Rate Limiting**: Health endpoints are excluded from rate limiting by default
4. **Information Disclosure**: Be careful about exposing internal service details

## Performance Considerations

1. **Health Check Latency**: Health checks should complete in < 500ms
2. **Connection Pooling**: Health indicators reuse connections where possible
3. **Timeout Configuration**: Health checks have aggressive timeouts to fail fast
4. **Caching**: Consider caching health check results for high-traffic scenarios

## Future Enhancements

- [ ] Add health check for BullMQ queue system
- [ ] Implement circuit breaker pattern for RPC providers
- [ ] Add custom health metrics dashboard
- [ ] Implement health check result caching
- [ ] Add health check for Sentry integration
- [ ] Implement gradual degradation based on health scores
