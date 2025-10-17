# Docker Deployment Guide

This guide explains how to deploy the Boggy Volume Bot backend (API + Workers) using Docker.

## Quick Start

### 1. Single Dockerfile Deployment (Coolify/Railway)

The `Dockerfile` in the backend root builds both API and Workers as separate targets.

**For API Service:**
- Build target: `api`
- Port: `3001` (or set via `API_PORT`)
- Healthcheck: `/v1/health`

**For Workers Service:**
- Build target: `workers`
- No port exposure needed

### 2. Coolify Setup

#### Deploy API

1. **Repository**: Select `boggy-volbot-backend`
2. **Branch**: `main`
3. **Build Pack**: Select **Dockerfile**
4. **Base Directory**: `backend` (important!)
5. **Port**: `3001`
6. **Docker Target**: `api`
7. **Is it a static site?**: Unchecked

**Environment Variables** (Add in Coolify):
```env
NODE_ENV=production
API_PORT=3001
API_HOST=0.0.0.0
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
DATABASE_URL=your-database-url
REDIS_URL=redis://your-redis:6379
SOLANA_RPC_URL=your-rpc-url
SOLANA_RPC_WSS_URL=your-wss-url
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-encryption-key
```

#### Deploy Workers

Repeat the same steps but:
- **Docker Target**: `workers`
- **Port**: Leave empty (workers don't expose ports)
- Use the same environment variables (except API_PORT and API_HOST)

### 3. Docker Compose Deployment (Local/VPS)

#### Setup

```bash
# Navigate to backend directory
cd backend

# Copy environment file
cp .env.docker.example .env

# Edit .env with your values
nano .env

# Build and start all services
docker-compose -f docker-compose.production.yml up -d

# View logs
docker-compose -f docker-compose.production.yml logs -f

# Stop services
docker-compose -f docker-compose.production.yml down
```

#### What Gets Deployed

The docker-compose file includes:
- **Redis**: Persistent Redis instance
- **API**: REST API service on port 3001
- **Workers**: Background job processors

All services are connected via a private network.

### 4. Manual Docker Build

#### Build Both Services

```bash
# Build API
docker build -t boggy-api:latest --target api -f backend/Dockerfile backend/

# Build Workers
docker build -t boggy-workers:latest --target workers -f backend/Dockerfile backend/
```

#### Run API

```bash
docker run -d \
  --name boggy-api \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e API_PORT=3001 \
  -e SUPABASE_URL=your-url \
  -e REDIS_URL=redis://your-redis:6379 \
  # ... add all environment variables
  boggy-api:latest
```

#### Run Workers

```bash
docker run -d \
  --name boggy-workers \
  -e NODE_ENV=production \
  -e SUPABASE_URL=your-url \
  -e REDIS_URL=redis://your-redis:6379 \
  # ... add all environment variables
  boggy-workers:latest
```

## Architecture

```
backend/
├── Dockerfile              # Multi-stage build for both services
├── docker-compose.production.yml  # Full stack deployment
├── api/                    # API service source
│   ├── src/
│   ├── package.json
│   └── Dockerfile         # (old, can be removed)
└── workers/                # Workers service source
    ├── src/
    ├── package.json
    └── Dockerfile         # (old, can be removed)
```

## Required Environment Variables

### Essential

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon key | `eyJhbG...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key | `eyJhbG...` |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://...` |
| `REDIS_URL` | Redis connection | `redis://host:6379` |
| `SOLANA_RPC_URL` | Solana RPC endpoint | `https://api.mainnet...` |
| `JWT_SECRET` | JWT signing secret | `random-secret-key` |
| `ENCRYPTION_KEY` | Data encryption key | `32-char-key` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `API_PORT` | API server port | `3001` |
| `API_HOST` | API bind address | `0.0.0.0` |
| `SENTRY_DSN` | Sentry error tracking | - |
| `JITO_BLOCK_ENGINE_URL` | Jito MEV engine | - |

## Health Checks

### API
- Endpoint: `GET /v1/health`
- Expected: `200 OK`

### Workers
- Process check: `pgrep -f "node dist/main.js"`

## Troubleshooting

### Build Fails

```bash
# Check Docker build logs
docker build --target api -f backend/Dockerfile backend/ --progress=plain

# Verify node_modules
docker run --rm -it node:20-alpine sh
```

### API Not Responding

```bash
# Check logs
docker logs boggy-api

# Check health
curl http://localhost:3001/v1/health
```

### Workers Not Processing

```bash
# Check logs
docker logs boggy-workers

# Verify Redis connection
docker exec boggy-workers node -e "console.log('Redis: ' + process.env.REDIS_URL)"
```

### Can't Connect to Database

- Verify `DATABASE_URL` is correct
- Check Supabase connection pooling settings
- Ensure IP whitelist includes your deployment server

## Production Recommendations

1. **Use External Redis**: Don't run Redis in the same container, use managed Redis (Upstash, Redis Cloud)
2. **Environment Secrets**: Store secrets in Coolify secrets or environment-specific vaults
3. **Monitoring**: Enable Sentry or similar error tracking
4. **Logging**: Configure proper log aggregation
5. **Backups**: Regular database backups via Supabase
6. **Scaling**: Run multiple worker instances for high volume

## Coolify-Specific Tips

1. **Set Base Directory**: Must be `backend` in Coolify settings
2. **Docker Target**: Specify `api` or `workers` in build args
3. **Health Checks**: Configure in Coolify using `/v1/health` for API
4. **Redis**: Deploy separate Redis service in Coolify
5. **Domains**: Set custom domain for API in Coolify settings

## Next Steps

After deployment:
1. Run database migrations (if needed)
2. Test API endpoints
3. Monitor worker job processing
4. Set up alerts for health check failures
5. Configure log retention
