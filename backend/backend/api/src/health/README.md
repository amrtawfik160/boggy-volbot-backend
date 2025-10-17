# Health Check Module

This module provides comprehensive health monitoring for the Solana Volume Bot API using `@nestjs/terminus`.

## Structure

```
health/
├── health.module.ts                    # Module definition
├── health.controller.ts                # Health endpoints controller
├── indicators/                         # Custom health indicators
│   ├── database.health.ts             # Database (Supabase) health check
│   ├── redis.health.ts                # Redis health check
│   └── rpc.health.ts                  # Solana RPC health check
└── __tests__/                         # Test files
    ├── health.integration.spec.ts     # Integration tests
    └── health-indicators.spec.ts      # Unit tests
```

## Features

- **Database Health Check**: Verifies Supabase/PostgreSQL connectivity
- **Redis Health Check**: Verifies Redis connectivity and responsiveness
- **RPC Health Check**: Verifies Solana RPC provider availability with degraded state support
- **Kubernetes Probes**: Liveness, readiness, and startup probes
- **Degraded State Handling**: Service continues when RPC providers are partially unavailable

## Endpoints

| Endpoint | Purpose | K8s Probe |
|----------|---------|-----------|
| `GET /health` | Full health check | - |
| `GET /health/live` | Liveness check | livenessProbe |
| `GET /health/ready` | Readiness check | readinessProbe |
| `GET /health/startup` | Startup check | startupProbe |

## Usage

### Import the Module

The HealthModule is already imported in `app.module.ts`:

```typescript
import { HealthModule } from './health/health.module';

@Module({
  imports: [HealthModule, ...],
})
export class AppModule {}
```

### Test Endpoints Locally

```bash
# Full health check
curl http://localhost:3001/health

# Liveness
curl http://localhost:3001/health/live

# Readiness
curl http://localhost:3001/health/ready

# Startup
curl http://localhost:3001/health/startup
```

## Configuration

### Environment Variables

The health checks use these environment variables:

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `REDIS_URL` - Redis connection URL
- `SOLANA_RPC_URL` - Primary Solana RPC endpoint
- `SOLANA_RPC_FALLBACK_URL` - Backup Solana RPC endpoint (optional)

### Adding More RPC Endpoints

To add more RPC endpoints for redundancy, update `rpc.health.ts`:

```typescript
this.rpcEndpoints = [
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  process.env.SOLANA_RPC_FALLBACK_URL || 'https://api.mainnet-beta.solana.com',
  process.env.SOLANA_RPC_FALLBACK_2_URL, // Add more as needed
].filter(Boolean);
```

## Testing

Run tests:

```bash
# All health tests
npm test -- src/health

# Integration tests only
npm test -- src/health/__tests__/health.integration.spec.ts

# Unit tests only
npm test -- src/health/__tests__/health-indicators.spec.ts
```

## Documentation

See [HEALTH_CHECKS.md](../docs/HEALTH_CHECKS.md) for comprehensive documentation including:
- Detailed endpoint specifications
- Kubernetes configuration examples
- Monitoring and alerting setup
- Troubleshooting guide
- Best practices

## Examples

### Healthy Response

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
      "total": 2
    }
  }
}
```

### Degraded Response (RPC Partially Down)

```json
{
  "status": "ok",
  "info": {
    "rpc": {
      "status": "degraded",
      "message": "Some RPC providers are unavailable but service continues",
      "healthy": 1,
      "total": 2
    }
  }
}
```

### Unhealthy Response

```json
{
  "status": "error",
  "error": {
    "database": {
      "status": "down",
      "message": "Connection timeout"
    }
  }
}
```
