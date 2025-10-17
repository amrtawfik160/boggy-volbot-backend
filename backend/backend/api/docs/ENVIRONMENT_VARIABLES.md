# Environment Variables Reference

Complete reference for all environment variables used in the Solana Volume Bot API and Workers.

## Table of Contents

- [Required Variables](#required-variables)
- [Optional Variables](#optional-variables)
- [Database Configuration](#database-configuration)
- [Redis Configuration](#redis-configuration)
- [Solana RPC Configuration](#solana-rpc-configuration)
- [Trading Configuration](#trading-configuration)
- [Security & Encryption](#security--encryption)
- [Monitoring & Observability](#monitoring--observability)
- [Examples](#examples)

## Required Variables

These variables **must** be set for the application to function.

### `DATABASE_URL`
- **Type**: String (PostgreSQL connection string)
- **Required**: Yes
- **Description**: PostgreSQL database connection string
- **Example**: `postgresql://user:password@localhost:5432/solana_volume_bot`
- **Format**: `postgresql://[user[:password]@][host][:port][/dbname][?param1=value1&...]`

### `SUPABASE_URL`
- **Type**: String (URL)
- **Required**: Yes
- **Description**: Supabase project URL for authentication and database
- **Example**: `https://xyzcompany.supabase.co`
- **Where to find**: Supabase Dashboard → Project Settings → API

### `SUPABASE_ANON_KEY`
- **Type**: String (JWT)
- **Required**: Yes
- **Description**: Supabase anonymous/public API key for client-side auth
- **Example**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Where to find**: Supabase Dashboard → Project Settings → API → anon/public key

### `SUPABASE_SERVICE_ROLE_KEY`
- **Type**: String (JWT)
- **Required**: Yes
- **Description**: Supabase service role key for server-side operations (bypasses RLS)
- **Example**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Where to find**: Supabase Dashboard → Project Settings → API → service_role key
- **Security**: Never expose this key client-side!

### `REDIS_URL`
- **Type**: String (Redis connection URL)
- **Required**: Yes
- **Description**: Redis connection URL for BullMQ job queues
- **Example**: `redis://localhost:6379`
- **Formats**:
  - Basic: `redis://localhost:6379`
  - With auth: `redis://:password@localhost:6379`
  - TLS: `rediss://:password@host:6380`
  - With database: `redis://localhost:6379/2`

### `SOLANA_RPC_PRIMARY`
- **Type**: String (URL)
- **Required**: Yes
- **Description**: Primary Solana RPC endpoint for blockchain interactions
- **Example**: `https://api.mainnet-beta.solana.com`
- **Recommended providers**:
  - Mainnet: Helius, QuickNode, Triton, Alchemy
  - Devnet: `https://api.devnet.solana.com`
  - Testnet: `https://api.testnet.solana.com`

### `MASTER_KEY`
- **Type**: String (Base64-encoded 32-byte key)
- **Required**: Yes
- **Description**: Master encryption key for wallet private key encryption
- **Generation**: Run `pnpm run generate-master-key`
- **Example**: `aGVsbG93b3JsZGhlbGxvd29ybGRoZWxsb3dvcmxkMQ==`
- **Security**: Store securely in secrets manager, rotate periodically

## Optional Variables

These variables have sensible defaults but can be customized.

### API Configuration

#### `API_PORT`
- **Type**: Number
- **Default**: `3001`
- **Description**: Port number for the API server
- **Example**: `8080`

#### `NODE_ENV`
- **Type**: String
- **Default**: `development`
- **Options**: `development`, `production`, `test`
- **Description**: Application environment mode
- **Example**: `production`

#### `LOG_LEVEL`
- **Type**: String
- **Default**: `info`
- **Options**: `debug`, `info`, `warn`, `error`
- **Description**: Minimum log level to output
- **Example**: `debug`

### Solana RPC Configuration

#### `SOLANA_RPC_FALLBACK`
- **Type**: String (URL)
- **Default**: Value of `SOLANA_RPC_PRIMARY`
- **Description**: Fallback RPC endpoint if primary fails
- **Example**: `https://api.mainnet-beta.solana.com`

#### `SOLANA_RPC_PRIMARY_WS`
- **Type**: String (WebSocket URL)
- **Default**: WebSocket version of `SOLANA_RPC_PRIMARY`
- **Description**: WebSocket endpoint for real-time updates
- **Example**: `wss://api.mainnet-beta.solana.com`

#### `SOLANA_RPC_FALLBACK_WS`
- **Type**: String (WebSocket URL)
- **Default**: WebSocket version of `SOLANA_RPC_FALLBACK`
- **Description**: Fallback WebSocket endpoint
- **Example**: `wss://api.mainnet-beta.solana.com`

### Trading Configuration

#### `BUY_LOWER_AMOUNT`
- **Type**: Number (SOL)
- **Default**: `0.001`
- **Description**: Minimum SOL amount for buy transactions
- **Example**: `0.005`
- **Range**: `0.001` - `10`

#### `BUY_UPPER_AMOUNT`
- **Type**: Number (SOL)
- **Default**: `0.002`
- **Description**: Maximum SOL amount for buy transactions
- **Example**: `0.01`
- **Range**: `0.001` - `10`
- **Note**: Must be >= `BUY_LOWER_AMOUNT`

#### `SELL_LOWER_AMOUNT`
- **Type**: Number (percentage)
- **Default**: `100`
- **Description**: Minimum percentage of tokens to sell
- **Example**: `50`
- **Range**: `1` - `100`

#### `SELL_UPPER_AMOUNT`
- **Type**: Number (percentage)
- **Default**: `100`
- **Description**: Maximum percentage of tokens to sell
- **Example**: `100`
- **Range**: `1` - `100`

#### `SLIPPAGE_BPS`
- **Type**: Number (basis points)
- **Default**: `100`
- **Description**: Maximum allowed slippage in basis points (1 bps = 0.01%)
- **Example**: `500` (5% slippage)
- **Common values**:
  - `50` = 0.5% (low slippage, may fail)
  - `100` = 1% (recommended for liquid tokens)
  - `500` = 5% (high slippage, less likely to fail)

### Jito Configuration

#### `JITO_KEYPAIR_JSON`
- **Type**: String (JSON array)
- **Required**: No (only if using Jito)
- **Description**: Jito keypair as JSON array for bundle submission
- **Example**: `[123,45,67,...]`
- **Where to get**: Generate with Solana CLI: `solana-keygen new`

#### `JITO_TIP_AMOUNT`
- **Type**: Number (SOL)
- **Default**: `0.001`
- **Description**: SOL tip amount for Jito bundles
- **Example**: `0.005`
- **Range**: `0.0001` - `1`

#### `JITO_BLOCK_ENGINE_URL`
- **Type**: String (URL)
- **Default**: `https://ny.mainnet.block-engine.jito.wtf`
- **Description**: Jito block engine endpoint
- **Available regions**:
  - Amsterdam: `https://amsterdam.mainnet.block-engine.jito.wtf`
  - Frankfurt: `https://frankfurt.mainnet.block-engine.jito.wtf`
  - New York: `https://ny.mainnet.block-engine.jito.wtf`
  - Tokyo: `https://tokyo.mainnet.block-engine.jito.wtf`

### Distribution Configuration

#### `DISTRIBUTE_WALLET_NUM`
- **Type**: Number
- **Default**: `5`
- **Description**: Number of wallets to distribute funds to
- **Example**: `10`
- **Range**: `1` - `100`

## Database Configuration

### Connection Pooling

#### `DATABASE_POOL_MIN`
- **Type**: Number
- **Default**: `2`
- **Description**: Minimum number of database connections in pool
- **Example**: `5`

#### `DATABASE_POOL_MAX`
- **Type**: Number
- **Default**: `10`
- **Description**: Maximum number of database connections in pool
- **Example**: `20`
- **Recommended**: Set to `(number_of_api_instances * 10)`

### Migration Configuration

#### `DATABASE_SCHEMA`
- **Type**: String
- **Default**: `public`
- **Description**: PostgreSQL schema for migrations
- **Example**: `solana_volume_bot`

## Redis Configuration

### Connection Options

#### `REDIS_MAX_RETRIES_PER_REQUEST`
- **Type**: Number
- **Default**: `null` (for BullMQ)
- **Description**: Max retries per Redis command
- **Example**: `3`
- **Note**: BullMQ requires `null` for proper functioning

#### `REDIS_ENABLE_READY_CHECK`
- **Type**: Boolean
- **Default**: `false` (for BullMQ)
- **Description**: Check if Redis is ready before accepting commands
- **Example**: `true`

### Queue Configuration

#### `REDIS_POOL_SIZE`
- **Type**: Number
- **Default**: `10`
- **Description**: Number of Redis connections in pool
- **Example**: `20`

## Security & Encryption

### Master Key Rotation

#### `MASTER_KEY_ROTATION_ID`
- **Type**: String
- **Default**: None
- **Description**: ID of the current master key (for rotation)
- **Example**: `key-2024-01`

#### `OLD_MASTER_KEY`
- **Type**: String (Base64)
- **Default**: None
- **Description**: Previous master key (during rotation period)
- **Example**: `b2xka2V5b2xka2V5b2xka2V5b2xka2V5MQ==`

### API Security

#### `JWT_SECRET`
- **Type**: String
- **Default**: Auto-generated
- **Description**: Secret for signing internal JWTs (if not using Supabase)
- **Example**: `super-secret-jwt-key-change-in-production`

## Monitoring & Observability

### Sentry

#### `SENTRY_DSN`
- **Type**: String (URL)
- **Default**: None
- **Description**: Sentry Data Source Name for error tracking
- **Example**: `https://abc123@o123456.ingest.sentry.io/7890123`
- **Where to find**: Sentry Dashboard → Project Settings → Client Keys (DSN)

#### `SENTRY_ENVIRONMENT`
- **Type**: String
- **Default**: Value of `NODE_ENV`
- **Description**: Environment tag for Sentry errors
- **Example**: `production`

#### `SENTRY_TRACES_SAMPLE_RATE`
- **Type**: Number (0-1)
- **Default**: `0.1` (10%)
- **Description**: Percentage of transactions to trace
- **Example**: `1.0` (100% in staging)

### OpenTelemetry

#### `OTEL_EXPORTER_OTLP_ENDPOINT`
- **Type**: String (URL)
- **Default**: None
- **Description**: OpenTelemetry collector endpoint
- **Example**: `https://otlp.collector.example.com`

#### `OTEL_SERVICE_NAME`
- **Type**: String
- **Default**: `solana-volume-bot-api`
- **Description**: Service name for telemetry
- **Example**: `api`

### CloudWatch Logging

#### `AWS_REGION`
- **Type**: String
- **Default**: None
- **Description**: AWS region for CloudWatch
- **Example**: `us-east-1`

#### `AWS_ACCESS_KEY_ID`
- **Type**: String
- **Default**: None
- **Description**: AWS access key for CloudWatch
- **Example**: `AKIAIOSFODNN7EXAMPLE`

#### `AWS_SECRET_ACCESS_KEY`
- **Type**: String
- **Default**: None
- **Description**: AWS secret key for CloudWatch
- **Example**: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`

#### `CLOUDWATCH_LOG_GROUP`
- **Type**: String
- **Default**: `/aws/solana-volume-bot`
- **Description**: CloudWatch log group name
- **Example**: `/aws/my-app/api`

#### `CLOUDWATCH_LOG_STREAM`
- **Type**: String
- **Default**: `api-{instance_id}`
- **Description**: CloudWatch log stream name
- **Example**: `api-instance-1`

### Prometheus Metrics

#### `METRICS_PORT`
- **Type**: Number
- **Default**: Same as `API_PORT`
- **Description**: Port for Prometheus metrics endpoint
- **Example**: `9090`

#### `METRICS_PATH`
- **Type**: String
- **Default**: `/metrics`
- **Description**: Path for Prometheus metrics
- **Example**: `/api/metrics`

## Examples

### Development Environment

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/solana_volume_bot_dev

# Supabase
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJI...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...

# Redis
REDIS_URL=redis://localhost:6379

# API
API_PORT=3001
NODE_ENV=development
LOG_LEVEL=debug

# Solana (Devnet)
SOLANA_RPC_PRIMARY=https://api.devnet.solana.com
SOLANA_RPC_FALLBACK=https://api.devnet.solana.com

# Master Key (Development only!)
MASTER_KEY=ZGV2ZWxvcG1lbnRrZXlkZXZlbG9wbWVudGtleQ==

# Trading (Conservative)
BUY_LOWER_AMOUNT=0.001
BUY_UPPER_AMOUNT=0.002
SLIPPAGE_BPS=500
```

### Production Environment

```env
# Database (Managed PostgreSQL)
DATABASE_URL=postgresql://prod_user:secure_password@db.example.com:5432/solana_volume_bot?sslmode=require
DATABASE_POOL_MAX=50

# Supabase
SUPABASE_URL=https://production.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJI...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...

# Redis (Managed/Cluster)
REDIS_URL=rediss://:secure_password@redis.example.com:6380
REDIS_POOL_SIZE=20

# API
API_PORT=3001
NODE_ENV=production
LOG_LEVEL=info

# Solana (Mainnet with premium RPC)
SOLANA_RPC_PRIMARY=https://my-premium-rpc.helius-rpc.com
SOLANA_RPC_FALLBACK=https://backup-rpc.quicknode.pro
SOLANA_RPC_PRIMARY_WS=wss://my-premium-rpc.helius-rpc.com
SOLANA_RPC_FALLBACK_WS=wss://backup-rpc.quicknode.pro

# Master Key (From secrets manager)
MASTER_KEY=${SECRETS_MASTER_KEY}

# Trading (Production values)
BUY_LOWER_AMOUNT=0.005
BUY_UPPER_AMOUNT=0.01
SLIPPAGE_BPS=100

# Jito
JITO_KEYPAIR_JSON=[123,45,67,...]
JITO_TIP_AMOUNT=0.005
JITO_BLOCK_ENGINE_URL=https://ny.mainnet.block-engine.jito.wtf

# Monitoring
SENTRY_DSN=https://abc@sentry.io/123
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.example.com

# CloudWatch
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=${SECRETS_AWS_KEY}
AWS_SECRET_ACCESS_KEY=${SECRETS_AWS_SECRET}
CLOUDWATCH_LOG_GROUP=/aws/prod/solana-volume-bot
```

### Docker Compose

```env
# Use environment variable substitution
DATABASE_URL=${DATABASE_URL}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
REDIS_URL=redis://redis:6379
SOLANA_RPC_PRIMARY=${SOLANA_RPC_PRIMARY}
MASTER_KEY=${MASTER_KEY}
```

## Best Practices

1. **Never commit `.env` files** - Add to `.gitignore`
2. **Use secrets managers** - AWS Secrets Manager, Google Secret Manager, HashiCorp Vault
3. **Rotate sensitive keys regularly** - Especially `MASTER_KEY` and API keys
4. **Use different keys per environment** - Dev, staging, production
5. **Validate on startup** - Application validates required variables
6. **Document custom variables** - If you add new variables, document them
7. **Use strong encryption** - For `MASTER_KEY`, use cryptographically secure random generation

## Validation

The application validates environment variables on startup. Missing required variables will cause the application to fail with descriptive error messages.

To validate manually:

```bash
# Run validation script
cd backend/api
node -e "require('./dist/config/environment').validateEnvironmentConfig()"
```

## Troubleshooting

### Common Issues

**Missing required variable:**
```
Error: Missing required environment variable: DATABASE_URL
```
**Solution**: Set the variable in `.env` or environment

**Invalid format:**
```
Error: DATABASE_URL must be a valid PostgreSQL connection string
```
**Solution**: Check the format matches `postgresql://user:password@host:port/database`

**Connection failures:**
```
Error: Unable to connect to Redis
```
**Solution**: Verify `REDIS_URL` is correct and Redis is running

---

For more information:
- [Deployment Guide](./DEPLOYMENT.md)
- [API Documentation](../README.md)
