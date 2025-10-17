# Solana Volume Bot - Backend

Multi-tenant, scalable backend for the Solana Volume Bot platform built with NestJS, BullMQ, and Supabase.

## Architecture

### Monorepo Structure

```
backend/
├── api/              # NestJS REST API
├── workers/          # BullMQ workers for job processing
└── libs/
    ├── core/         # Shared business logic (wraps legacy CLI code)
    └── types/        # Shared TypeScript types and DTOs
```

## Prerequisites

- Node.js >= 20.x
- pnpm >= 9.x
- Redis >= 7.x
- Supabase account (for auth and database)

## Setup

### 1. Install Dependencies

From the repository root:

```bash
pnpm install
```

### 2. Environment Configuration

Copy the example environment file:

```bash
cp backend/env.example backend/.env
```

Configure the following required variables:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (for admin operations)
- `REDIS_URL`: Redis connection URL

Optional trading-specific variables are pre-configured with sensible defaults.

### 3. Database Setup

Run the Supabase migrations (see `docs/database-schema.sql` for the schema):

```bash
# Using Supabase CLI
supabase db push

# Or apply manually via Supabase dashboard
```

### 4. Start Services

**Development mode:**

```bash
# Start Redis (if not running)
docker run -d -p 6379:6379 redis:7-alpine

# Start API
cd backend/api && pnpm dev

# Start Workers (in another terminal)
cd backend/workers && pnpm dev
```

**Using Docker Compose:**

```bash
docker-compose -f backend/docker-compose.yml up
```

## Testing

### Unit Tests

```bash
# Run all tests
cd backend/api && pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

### Integration Tests

```bash
cd backend/api && pnpm test:integration
```

## API Documentation

### Authentication

All protected endpoints require a Bearer token from Supabase Auth:

```
Authorization: Bearer <supabase-jwt-token>
```

### Endpoints (MVP)

- `GET /health` - Health check
- `GET /v1/me` - Current user profile (protected)
- `GET /v1/tokens` - List user tokens (protected)
- `POST /v1/tokens` - Register SPL token (protected)
- `GET /v1/pools` - Discover pools for a mint
- `GET /v1/wallets` - List wallets (protected)
- `POST /v1/wallets` - Add wallet (protected)
- `GET /v1/campaigns` - List campaigns (protected)
- `POST /v1/campaigns` - Create campaign (protected)
- `POST /v1/campaigns/:id/start` - Start campaign (protected)
- `POST /v1/campaigns/:id/pause` - Pause campaign (protected)
- `POST /v1/campaigns/:id/stop` - Stop campaign (protected)

## Queue System

### Queues

- `gather` - Pool info and balance fetching
- `trade.buy` - Buy transaction execution
- `trade.sell` - Sell transaction execution
- `distribute` - SOL distribution to wallets
- `status` - Campaign metrics aggregation
- `webhook` - Event delivery

### Worker Configuration

Workers can be scaled horizontally by running multiple instances. Concurrency is controlled via environment variables:

```env
WORKER_CONCURRENCY=10
```

## Security

- **Wallet Keys**: Encrypted at rest using AES-256-GCM
- **API Auth**: Supabase JWT validation on all protected endpoints
- **Rate Limiting**: Configured per-user and per-IP
- **Input Validation**: class-validator on all DTOs

## Scalability

- **Horizontal Scaling**: API and workers can be deployed across multiple instances
- **Queue Processing**: BullMQ with Redis for distributed job processing
- **Connection Pooling**: Supabase client configured with connection pooling
- **Caching**: Redis caching for pool info and token metadata

## Monitoring

The Volume Bot backend includes comprehensive monitoring and observability:

- **Prometheus Metrics**: Real-time performance monitoring at `/metrics` endpoint
- **Sentry Error Tracking**: Comprehensive error capture and debugging
- **OpenTelemetry Tracing**: Distributed tracing across services

**📖 See [MONITORING.md](./MONITORING.md) for complete setup and usage guide**

Key metrics tracked:

- Queue depth and processing rate
- API request latency (P50, P95, P99)
- Transaction success/failure rates
- RPC endpoint health
- Active campaigns and transaction counts
- System resources (CPU, memory, event loop)

## Troubleshooting

### TypeScript errors in legacy code

The `backend/libs/core/src/legacy` folder contains wrapped CLI code. If you see import errors:

```bash
cd backend/libs/types && pnpm tsc -p tsconfig.build.json
cd backend/libs/core && pnpm tsc -p tsconfig.build.json
```

### Redis connection issues

Ensure Redis is running:

```bash
redis-cli ping
# Should return: PONG
```

### Supabase auth failures

Verify your Supabase credentials in `.env` match your project settings.

## Development Workflow

1. Make changes to source files
2. Run tests: `pnpm test`
3. Type-check: `pnpm type-check`
4. Lint: `pnpm lint`
5. Format: `pnpm format`

## Production Deployment

1. Build all packages:

    ```bash
    pnpm build
    ```

2. Set production environment variables

3. Run database migrations

4. Start services:
    ```bash
    cd backend/api && pnpm start
    cd backend/workers && pnpm start
    ```

## License

MIT
