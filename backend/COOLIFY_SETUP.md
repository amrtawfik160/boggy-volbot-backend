# Coolify Deployment Setup

Simple guide for deploying the backend to Coolify.

## Prerequisites

1. Redis instance (deploy separately in Coolify or use external service)
2. Supabase database configured
3. Environment variables ready

## Deploy API Service

### Configuration

1. **Create New Application** in Coolify
2. **Repository**: `amrtawfik160/boggy-volbot-backend` (or your repo)
3. **Branch**: `main`
4. **Build Pack**: Select **Dockerfile**
5. **Base Directory**: Leave **EMPTY** (Dockerfile is in root)
6. **Dockerfile Location**: `Dockerfile` (default)
7. **Docker Build Arguments**: Add `--target api`
8. **Port**: `3001`
9. **Is it a static site?**: **Unchecked**

### Environment Variables

Add these in Coolify Environment Variables section:

```env
# Node Environment
NODE_ENV=production

# API Configuration
API_PORT=3001
API_HOST=0.0.0.0

# Database - Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
DATABASE_URL=postgresql://postgres:[password]@db.your-project.supabase.co:5432/postgres

# Redis
REDIS_URL=redis://your-redis-host:6379

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_RPC_WSS_URL=wss://api.mainnet-beta.solana.com

# Security
JWT_SECRET=your-random-jwt-secret-at-least-32-chars
ENCRYPTION_KEY=your-32-character-encryption-key

# Optional - Monitoring
SENTRY_DSN=
OTEL_EXPORTER_OTLP_ENDPOINT=

# Optional - Email
RESEND_API_KEY=
```

**Important**: For `NODE_ENV`, uncheck "Available at Buildtime" to avoid build issues.

### Build Command (if needed)

If Coolify has a build command field, leave it empty. The Dockerfile handles everything.

### Health Check

- Path: `/v1/health`
- Port: `3001`
- Interval: `30s`

## Deploy Workers Service

### Configuration

1. **Create Another New Application**
2. **Repository**: Same as API
3. **Branch**: `main`
4. **Build Pack**: **Dockerfile**
5. **Base Directory**: Leave **EMPTY**
6. **Dockerfile Location**: `Dockerfile`
7. **Docker Build Arguments**: Add `--target workers`
8. **Port**: Leave **EMPTY** (workers don't expose ports)

### Environment Variables

Same as API, but you can omit:
- `API_PORT`
- `API_HOST`

Add the same database, Redis, Solana, and security variables.

## Deploy Redis (Recommended)

Instead of bundling Redis, deploy it separately:

1. Create new **Database** in Coolify
2. Select **Redis**
3. Use the generated `REDIS_URL` in your API and Workers

## Troubleshooting

### Build Fails: "Dockerfile not found"

- Ensure Dockerfile is at repository root
- Set Base Directory to empty/blank
- Dockerfile Location should be `Dockerfile`

### Build Fails: "devDependencies not found"

- Uncheck "Available at Buildtime" for `NODE_ENV`
- Or set `NODE_ENV=development` only for build time

### API Doesn't Start

- Check logs in Coolify
- Verify all environment variables are set
- Test database connection
- Ensure Redis is accessible

### Workers Not Processing Jobs

- Check worker logs
- Verify Redis connection: same `REDIS_URL` for API and Workers
- Ensure database credentials are correct
- Check Solana RPC is accessible

## Quick Checklist

### Before Deployment

- [ ] Dockerfile exists at repository root
- [ ] All environment variables prepared
- [ ] Redis deployed or external Redis URL ready
- [ ] Supabase database configured
- [ ] Solana RPC endpoint tested

### API Deployment

- [ ] Repository connected
- [ ] Build target set to `api`
- [ ] Port set to `3001`
- [ ] All environment variables added
- [ ] Health check configured

### Workers Deployment

- [ ] Repository connected
- [ ] Build target set to `workers`
- [ ] No port configured
- [ ] All environment variables added (except API_PORT/HOST)

### After Deployment

- [ ] API health check passes: `curl https://your-api.com/v1/health`
- [ ] Workers processing jobs (check logs)
- [ ] Test creating a volume boost
- [ ] Monitor error logs

## Build Arguments in Coolify

If Coolify has a "Docker Build Arguments" or "Build Args" field:

**For API:**
```
--target api
```

**For Workers:**
```
--target workers
```

If it doesn't have this field, you might need to create two separate Dockerfiles or use Coolify's advanced settings.

## Advanced: Using Dockerfile Per Service

If Coolify doesn't support build targets well, you can:

1. Keep `backend/api/Dockerfile` and `backend/workers/Dockerfile`
2. For API: Set Base Directory to `backend/api`
3. For Workers: Set Base Directory to `backend/workers`

## Getting Help

Check Coolify logs:
```bash
# In Coolify dashboard
Applications → Your App → Logs
```

Common log locations:
- Build logs: Available during deployment
- Runtime logs: Check "Logs" tab after deployment
- Container logs: Use Coolify's log viewer

## Example Working Configuration

**API Service:**
```yaml
Repository: amrtawfik160/boggy-volbot-backend
Branch: main
Build Pack: Dockerfile
Base Directory: (empty)
Dockerfile: Dockerfile
Build Args: --target api
Port: 3001
Health: /v1/health
```

**Workers Service:**
```yaml
Repository: amrtawfik160/boggy-volbot-backend
Branch: main
Build Pack: Dockerfile
Base Directory: (empty)
Dockerfile: Dockerfile
Build Args: --target workers
Port: (empty)
```

## Next Steps

1. Deploy Redis first
2. Deploy API service
3. Test API health endpoint
4. Deploy Workers service
5. Monitor both services' logs
6. Test end-to-end functionality
