# Environment Configuration Guide

This document describes all environment variables used by the Boggy Volume Bot and how to configure them for different environments.

## Quick Start

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Fill in the required variables (see sections below)

3. Generate a secure master encryption key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

## Environment Modes

The application supports four environment modes via `NODE_ENV`:

- **development**: Local development with relaxed validation and default values
- **staging**: Pre-production environment with production-like validation
- **production**: Full validation, all required variables must be set
- **test**: Testing environment with mock values and minimal validation

## Required Variables by Environment

### Development

For local development, only these are strictly required:
- `NODE_ENV=development`
- `API_PORT` (defaults to 3001)

All other variables have sensible defaults for local development:
- Supabase: `http://localhost:54321` with test keys
- Redis: `redis://localhost:6379`
- Encryption: Auto-generated test key

### Production

In production (`NODE_ENV=production`), these variables are **required** and will cause startup failure if missing:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Public anon key for client operations
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (keep secret!)
- `REDIS_URL`: Redis connection string
- `MASTER_ENCRYPTION_KEY`: Base64-encoded 32+ byte encryption key

## Configuration Variables

### Core Application Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Application environment (development/staging/production/test) |
| `API_PORT` | No | `3001` | Port for the API server |

### Supabase Configuration

Supabase is used for authentication, database, and storage.

| Variable | Required in Prod | Default (Dev) | Description |
|----------|------------------|---------------|-------------|
| `SUPABASE_URL` | Yes | `http://localhost:54321` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | `test-anon-key` | Public anon key for client operations |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | `test-service-key` | Service role key for admin operations |

**Where to find these values:**
- Log into [Supabase Dashboard](https://app.supabase.com)
- Navigate to: Project → Settings → API
- Copy the URL and keys

**Security Note:** The service role key bypasses Row Level Security (RLS) - keep it secret!

### Redis Configuration

Redis is used for Bull job queues, rate limiting, and caching.

| Variable | Required in Prod | Default (Dev) | Description |
|----------|------------------|---------------|-------------|
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection URL |

**Connection string formats:**
- Local: `redis://localhost:6379`
- With password: `redis://:password@localhost:6379`
- Redis Cloud: `redis://user:password@host:port`
- TLS: `rediss://user:password@host:port`

### Security Configuration

| Variable | Required in Prod | Default (Dev) | Description |
|----------|------------------|---------------|-------------|
| `MASTER_ENCRYPTION_KEY` | Yes | Auto-generated test key | Base64-encoded master key for encrypting sensitive data |

**How to generate:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Security Requirements:**
- Must be at least 32 bytes when base64 decoded
- Must be base64-encoded
- Should be unique per environment
- Store in secrets manager (see recommendations below)

**What is encrypted:**
- Wallet private keys
- API keys stored in database
- Other sensitive user data

### Solana RPC Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOLANA_RPC_URL` | No | `https://api.mainnet-beta.solana.com` | Primary Solana RPC endpoint |
| `RPC_ENDPOINT` | No | `https://api.mainnet-beta.solana.com` | Alternative RPC endpoint variable |
| `RPC_WEBSOCKET_ENDPOINT` | No | `wss://api.mainnet-beta.solana.com` | WebSocket endpoint for subscriptions |

**Recommendations:**
- Development: Public endpoints are fine (rate limited)
- Production: Use dedicated RPC provider to avoid rate limits:
  - [Helius](https://helius.dev)
  - [QuickNode](https://quicknode.com)
  - [Alchemy](https://alchemy.com)
  - [Triton](https://triton.one)

### CORS Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CORS_ORIGIN` | No | `*` | CORS origin for API requests |

**Recommendations:**
- Development: `*` (allow all)
- Production: Specific domain (e.g., `https://yourdomain.com`)

### Trading Configuration Defaults

These provide default values that can be overridden per campaign via the API.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BUY_LOWER_AMOUNT` | No | None | Minimum buy amount per transaction (SOL) |
| `BUY_UPPER_AMOUNT` | No | None | Maximum buy amount per transaction (SOL) |
| `BUY_INTERVAL_MIN` | No | None | Minimum interval between buys (ms) |
| `BUY_INTERVAL_MAX` | No | None | Maximum interval between buys (ms) |
| `DISTRIBUTE_WALLET_NUM` | No | `5` | Default number of wallets for distribution |
| `SELL_ALL_BY_TIMES` | No | `1` | Number of transactions to split sells into |

### Jito Configuration

[Jito](https://jito.wtf) provides MEV protection and transaction bundling.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JITO_KEY` | No | None | Jito authentication keypair (base58) |
| `BLOCKENGINE_URL` | No | `https://mainnet.block-engine.jito.wtf` | Jito block engine URL |
| `JITO_FEE` | No | `0.0001` | Jito tip amount (SOL) |

**How to get Jito key:**
1. Generate a keypair: `solana-keygen new --outfile jito-auth.json`
2. Extract the private key and base58 encode it
3. Set as `JITO_KEY` environment variable

### Transaction Fees

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TX_FEE` | No | None | Base transaction fee (SOL) |
| `ADDITIONAL_FEE` | No | None | Additional fee for priority (SOL) |

### Worker Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STATUS_AGGREGATOR_INTERVAL_SECONDS` | No | `15` | Status aggregation interval (seconds) |

## Validation

The application validates environment configuration on startup:

1. **Production Mode**: All required variables must be set, or the app will fail to start
2. **Development Mode**: Uses sensible defaults for missing variables
3. **Encryption Key**: Validates format and minimum length
4. **Logging**: Outputs configuration summary on startup

Example startup output:
```
🚀 Starting API in production mode
📡 API Port: 3001
🗄️  Supabase URL: https://your-project.supabase.co
📦 Redis URL: redis://your-redis-host:6379
✅ API is running on port 3001
```

If validation fails:
```
❌ Environment validation failed: Missing required environment variables in production: SUPABASE_URL, REDIS_URL, MASTER_ENCRYPTION_KEY. Please check your environment configuration.
```

## Secrets Management Recommendations

For production deployments, **never** store secrets directly in `.env` files or commit them to version control.

### Recommended Solutions

#### AWS Secrets Manager
- Store secrets in AWS Secrets Manager
- Retrieve at application startup
- Supports automatic rotation
- [Documentation](https://aws.amazon.com/secrets-manager/)

#### Doppler
- Centralized secrets management
- Environment-specific configurations
- Easy integration with CI/CD
- [Documentation](https://www.doppler.com/)

#### HashiCorp Vault
- Enterprise-grade secrets management
- Dynamic secrets generation
- Audit logging
- [Documentation](https://www.vaultproject.io/)

#### Infisical
- Open-source secrets management
- Team collaboration features
- Self-hosted or cloud
- [Documentation](https://infisical.com/)

### Best Practices

1. **Never commit secrets to Git**
   - Add `.env` to `.gitignore`
   - Use `.env.example` as a template (no real values)

2. **Use different secrets per environment**
   - Development, staging, and production should have unique keys
   - Rotate keys regularly

3. **Limit access**
   - Only grant access to secrets on a need-to-know basis
   - Use IAM roles and policies

4. **Audit and monitor**
   - Log secret access
   - Alert on unauthorized access attempts
   - Rotate compromised secrets immediately

5. **Encryption key rotation**
   - Plan for regular rotation of `MASTER_ENCRYPTION_KEY`
   - Implement key versioning
   - Re-encrypt data with new keys

## Environment-Specific Examples

### Local Development

```bash
NODE_ENV=development
API_PORT=3001
# Everything else uses defaults
```

### Staging

```bash
NODE_ENV=staging
API_PORT=3001

# Supabase (staging project)
SUPABASE_URL=https://your-staging-project.supabase.co
SUPABASE_ANON_KEY=eyJh...staging...
SUPABASE_SERVICE_ROLE_KEY=eyJh...staging...

# Redis (staging instance)
REDIS_URL=redis://staging-redis:6379

# Security (staging key)
MASTER_ENCRYPTION_KEY=base64_staging_key_here

# Solana (devnet for staging)
SOLANA_RPC_URL=https://api.devnet.solana.com
RPC_WEBSOCKET_ENDPOINT=wss://api.devnet.solana.com
```

### Production

```bash
NODE_ENV=production
API_PORT=3001

# Supabase (production project)
SUPABASE_URL=https://your-prod-project.supabase.co
SUPABASE_ANON_KEY=eyJh...production...
SUPABASE_SERVICE_ROLE_KEY=eyJh...production...

# Redis (production with TLS)
REDIS_URL=rediss://user:pass@prod-redis:6380

# Security (production key from secrets manager)
MASTER_ENCRYPTION_KEY=base64_production_key_here

# Solana (dedicated RPC provider)
SOLANA_RPC_URL=https://your-dedicated-rpc.helius-rpc.com
RPC_WEBSOCKET_ENDPOINT=wss://your-dedicated-rpc.helius-rpc.com

# CORS (specific domain)
CORS_ORIGIN=https://yourdomain.com

# Jito (production)
JITO_KEY=base58_keypair_here
JITO_FEE=0.0001
```

## Troubleshooting

### Application Won't Start

**Error:** `Missing required environment variables in production`

**Solution:** Ensure all required production variables are set. Check the error message for which specific variables are missing.

### Invalid Encryption Key

**Error:** `MASTER_ENCRYPTION_KEY must be a valid base64-encoded string`

**Solution:**
1. Generate a new key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. Ensure the key is base64-encoded
3. Ensure it decodes to at least 32 bytes

### Supabase Connection Failed

**Symptoms:** Auth errors, database connection errors

**Solutions:**
1. Verify `SUPABASE_URL` is correct (check Supabase dashboard)
2. Verify `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are correct
3. Check network connectivity to Supabase
4. Verify project is not paused (free tier)

### Redis Connection Failed

**Symptoms:** Queue errors, rate limiting not working

**Solutions:**
1. Verify Redis is running: `redis-cli ping` (should return `PONG`)
2. Check `REDIS_URL` format is correct
3. Verify authentication credentials if using password
4. Check network connectivity and firewall rules

### RPC Rate Limiting

**Symptoms:** Transaction failures, slow responses

**Solutions:**
1. Switch to a dedicated RPC provider (Helius, QuickNode)
2. Increase RPC rate limits
3. Implement request caching
4. Use multiple RPC endpoints with fallback

## Support

For issues with environment configuration:
1. Check the application logs for specific error messages
2. Verify all required variables are set
3. Ensure values are in the correct format
4. Check this documentation for requirements

For production deployments, consider:
- Using infrastructure-as-code (Terraform, CloudFormation)
- Automating secrets rotation
- Implementing monitoring and alerting
- Regular security audits
