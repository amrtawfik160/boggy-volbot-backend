# Deployment Guide

This guide covers deploying the Solana Volume Bot to production environments using Docker Compose or Kubernetes.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Railway Deployment](#railway-deployment) (Recommended - Easiest)
- [Docker Compose Deployment](#docker-compose-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Scaling Workers](#scaling-workers)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Services

1. **Supabase Account** (Recommended)
   - Sign up at [supabase.com](https://supabase.com)
   - Create a new project
   - Note your project URL and API keys

2. **Redis** (Choose one)
   - Self-hosted (via Docker Compose)
   - Redis Cloud: [redis.com/redis-enterprise-cloud](https://redis.com/redis-enterprise-cloud/)
   - AWS ElastiCache
   - Other managed Redis providers

3. **Solana RPC Provider** (Recommended for production)
   - Helius: [helius.dev](https://helius.dev)
   - QuickNode: [quicknode.com](https://quicknode.com)
   - Alchemy: [alchemy.com](https://alchemy.com)
   - Public endpoints (not recommended for production)

### Required Tools

- Docker & Docker Compose (for Docker deployment)
- kubectl & Kubernetes cluster (for K8s deployment)
- Node.js 20+ (for local development)
- Railway CLI (for Railway deployment)

## Railway Deployment

Railway is the easiest and fastest way to deploy your backend. Railway handles infrastructure, provides automatic Redis, and offers one-click deployments.

### Why Railway?

- **Zero infrastructure management** - Railway handles everything
- **Built-in Redis** - Automatic Redis provisioning with connection URL
- **Automatic SSL/HTTPS** - Free SSL certificates
- **Easy scaling** - Scale with a single click or command
- **GitHub integration** - Auto-deploy on push
- **Free tier** - $5 credit/month to start
- **One-click rollbacks** - Easy to revert deployments

### 1. Initial Setup

#### Option A: Railway Dashboard (Recommended for First Time)

1. **Sign up for Railway**:
   - Go to https://railway.app/
   - Sign up with GitHub (recommended)

2. **Create New Project**:
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your GitHub account
   - Select your `boggy-volume-bot` repository

3. **Configure API Service**:
   - Click "New Service" → "GitHub Repo"
   - Railway will detect your repository
   - **Settings to configure**:
     - **Service Name**: `volume-bot-api`
     - **Root Directory**: `backend/api`
     - **Builder**: Dockerfile (auto-detected)
     - **Health Check Path**: `/v1/health`

4. **Add Redis Database**:
   - In project dashboard, click "New"
   - Select "Database" → "Add Redis"
   - Railway automatically creates `REDIS_URL` variable

5. **Configure Environment Variables**:

   Go to `volume-bot-api` service → Variables tab, add these:

   ```env
   # === REQUIRED ===
   NODE_ENV=production
   API_PORT=3001

   # Supabase (from your Supabase dashboard)
   SUPABASE_URL=https://ottitsqzdtdvnhcdtzuj.supabase.co
   SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # Security - Generate new key for production!
   MASTER_ENCRYPTION_KEY=your_32byte_base64_key

   # CORS - Update with your frontend domain
   CORS_ORIGIN=https://your-frontend.vercel.app

   # === OPTIONAL BUT RECOMMENDED ===

   # Solana RPC (use dedicated provider for production)
   SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
   RPC_ENDPOINT=https://api.mainnet-beta.solana.com
   RPC_WEBSOCKET_ENDPOINT=wss://api.mainnet-beta.solana.com

   # Trading defaults
   BUY_LOWER_AMOUNT=0.001
   BUY_UPPER_AMOUNT=0.002
   BUY_INTERVAL_MIN=2000
   BUY_INTERVAL_MAX=4000

   # Monitoring (highly recommended)
   SENTRY_DSN=your_sentry_dsn
   SENTRY_ENVIRONMENT=production
   OTEL_ENABLED=true
   ```

   **Important**: Generate a new `MASTER_ENCRYPTION_KEY`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

6. **Deploy**:
   - Railway automatically builds and deploys
   - View logs in real-time from Deployments tab
   - Get your API URL from Settings → Domains

#### Option B: Railway CLI (For Faster Subsequent Deploys)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Navigate to backend API directory
cd backend/api

# Initialize Railway project (first time only)
railway init

# Or link to existing project
railway link

# Add Redis database
railway add -d redis

# Set environment variables (do this once)
railway variables set NODE_ENV=production
railway variables set API_PORT=3001
railway variables set SUPABASE_URL=your_url
railway variables set SUPABASE_ANON_KEY=your_key
railway variables set SUPABASE_SERVICE_ROLE_KEY=your_key
railway variables set MASTER_ENCRYPTION_KEY=your_key
railway variables set CORS_ORIGIN=your_frontend_url

# Deploy
railway up

# Get your public URL
railway domain
```

### 2. Add Workers Service (Optional but Recommended)

Workers handle background job processing. Deploy them separately:

1. **Add New Service**:
   - In project dashboard, click "New" → "GitHub Repo"
   - Select same repository

2. **Configure Worker Service**:
   - **Service Name**: `volume-bot-workers`
   - **Root Directory**: `backend/workers`
   - **Builder**: Dockerfile

3. **Share Environment Variables**:
   - Workers need same environment variables as API
   - Copy all variables from API service
   - Or use Railway's "Reference Variable" feature

4. **Scale Workers**:
   - Go to Settings → Replicas
   - Set desired number of worker instances (2-10 recommended)

### 3. Post-Deployment Steps

#### Verify Deployment

```bash
# Get your Railway domain
railway domain

# Test health endpoint
curl https://your-app.railway.app/v1/health

# Expected response:
# {
#   "status": "ok",
#   "info": {
#     "database": { "status": "up" },
#     "redis": { "status": "up" }
#   }
# }

# View API documentation
open https://your-app.railway.app/api-docs
```

#### View Logs

```bash
# Via CLI
railway logs

# Or via dashboard:
# Project → Service → Deployments → Click deployment → View Logs
```

#### Add Custom Domain (Optional)

1. Go to Service → Settings → Domains
2. Click "Custom Domain"
3. Enter your domain (e.g., `api.yourdomain.com`)
4. Add CNAME record to your DNS:
   ```
   Type: CNAME
   Name: api
   Value: your-app.railway.app
   ```
5. Railway automatically provisions SSL certificate

### 4. Continuous Deployment

Railway automatically deploys when you push to GitHub:

```bash
# Make changes to your code
git add .
git commit -m "feat: add new feature"
git push origin main

# Railway automatically:
# 1. Detects push
# 2. Builds Docker image
# 3. Runs health checks
# 4. Deploys new version
# 5. Routes traffic to new deployment
```

**Disable auto-deploy** (deploy manually):
```bash
railway settings --no-auto-deploy
```

### 5. Scaling on Railway

#### Vertical Scaling (More Resources per Instance)

1. Go to Service → Settings → Resources
2. Increase CPU/Memory allocation
3. Save and redeploy

#### Horizontal Scaling (More Instances)

Railway Pro plan supports multiple replicas:

```bash
# Via dashboard:
# Service → Settings → Replicas → Set desired count

# Via CLI:
railway settings --replicas 3
```

**Auto-scaling** with Railway Pro:
- Configurable CPU/Memory thresholds
- Automatic scale up/down based on load

### 6. Railway Environment Management

#### Multiple Environments

Create separate environments for staging/production:

```bash
# Create staging environment
railway environment create staging

# Switch environments
railway environment use staging
railway environment use production

# Deploy to specific environment
railway up --environment staging
```

#### Secrets Management

```bash
# Set sensitive variables
railway variables set DATABASE_PASSWORD=secret

# View all variables
railway variables

# Delete variable
railway variables delete OLD_VAR

# Export variables to .env (for local testing)
railway variables export > .env
```

### 7. Monitoring & Debugging

#### View Metrics

Railway dashboard provides:
- CPU usage
- Memory usage
- Network I/O
- Request count
- Error rates

#### View Real-time Logs

```bash
# Stream logs
railway logs --follow

# Filter logs
railway logs | grep ERROR

# Last 100 lines
railway logs --tail 100
```

#### Database Logs (Redis)

```bash
# View Redis logs
railway logs --service redis
```

### 8. Railway Cost Optimization

#### Free Tier ($5/month)

- Sufficient for development/testing
- ~500 hours of runtime
- 100GB outbound bandwidth

#### Pro Plan ($20/month)

- Multiple replicas
- Auto-scaling
- Priority support
- Higher resource limits

#### Cost-Saving Tips

1. **Use efficient Docker images** (already using multi-stage build)
2. **Set resource limits** to prevent runaway costs
3. **Scale down during off-hours** (if applicable)
4. **Monitor usage dashboard** regularly
5. **Use Railway's Redis** (included, no extra cost)

### 9. Troubleshooting Railway Deployment

#### Build Failures

```bash
# View build logs
railway logs --build

# Common issues:
# - Missing dependencies in package.json
# - Dockerfile syntax errors
# - Out of memory during build (increase build resources)
```

#### Runtime Errors

1. **Check health endpoint**:
   ```bash
   curl https://your-app.railway.app/v1/health
   ```

2. **View runtime logs**:
   ```bash
   railway logs --filter "ERROR"
   ```

3. **Verify environment variables**:
   ```bash
   railway variables
   ```

#### Redis Connection Issues

- Verify Redis service is running: Check Railway dashboard
- Verify `REDIS_URL` is set: `railway variables | grep REDIS`
- Test connection: Check logs for Redis connection errors

#### Database Connection Issues

1. **Verify Supabase credentials**:
   ```bash
   railway variables | grep SUPABASE
   ```

2. **Test connection from Railway**:
   ```bash
   # Use Railway's shell feature
   railway run bash
   # Inside shell: test connection
   curl https://your-supabase.supabase.co
   ```

3. **Check Supabase IP allowlist**: Allow Railway IPs

#### Port Issues

Railway automatically sets `$PORT` environment variable. Your app reads `API_PORT` (defaults to 3001), which works correctly.

### 10. Railway vs Other Platforms

| Feature | Railway | Heroku | AWS | DigitalOcean |
|---------|---------|--------|-----|--------------|
| **Ease of setup** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Auto-scaling** | ✅ (Pro) | ✅ | ✅ | ✅ |
| **Built-in Redis** | ✅ Free | ❌ Paid | ❌ Setup | ❌ Setup |
| **Free tier** | $5/mo | ❌ | ✅ Limited | ❌ |
| **Dockerfile support** | ✅ | ✅ | ✅ | ✅ |
| **GitHub integration** | ✅ | ✅ | ❌ Manual | ✅ |
| **Cost (small app)** | $5-20/mo | $25+/mo | $20+/mo | $12+/mo |
| **Learning curve** | Low | Low | High | Medium |

**Railway is recommended for this project because:**
- Simple deployment process
- Built-in Redis (critical requirement)
- Automatic HTTPS
- Easy scaling
- Cost-effective for small to medium apps

### Quick Reference: Railway Commands

```bash
# Setup
railway login                              # Login to Railway
railway init                              # Initialize project
railway link                              # Link to existing project

# Deployment
railway up                                # Deploy current directory
railway up --service api                  # Deploy specific service
railway up --environment production       # Deploy to specific environment

# Management
railway logs                              # View logs
railway logs --follow                     # Stream logs
railway domain                            # Get public URL
railway variables                         # List environment variables
railway variables set KEY=value           # Set variable
railway status                            # Check deployment status

# Databases
railway add -d redis                      # Add Redis database
railway add -d postgres                   # Add PostgreSQL database

# Environment
railway environment                       # List environments
railway environment create staging        # Create new environment
railway environment use staging           # Switch environment

# Service management
railway settings --replicas 3             # Scale to 3 instances
railway settings --no-auto-deploy         # Disable auto-deploy
railway open                              # Open dashboard in browser

# Debugging
railway run bash                          # Open shell in Railway environment
railway logs --service redis              # View service-specific logs
```

### Configuration Files

Two files have been created in `backend/api/`:

1. **`railway.json`** - Railway-specific configuration
2. **`.railwayignore`** - Files to exclude from deployment

These optimize your Railway deployment for better performance and faster builds.

---

## Docker Compose Deployment

### 1. Prepare Environment

```bash
# Copy environment template
cp .env.production.example .env

# Edit .env with your actual credentials
nano .env
```

**Critical environment variables:**
- `MASTER_ENCRYPTION_KEY` - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_PASSWORD` - Use a strong password
- `SOLANA_RPC_URL`, `RPC_ENDPOINT`, `RPC_WEBSOCKET_ENDPOINT`
- `SENTRY_DSN` (optional but recommended)

### 2. Build Docker Images

```bash
# Build API image
cd backend/api
docker build -t volume-bot-api:v1.0.0 .

# Build Worker image
cd ../workers
docker build -t volume-bot-worker:v1.0.0 .

# Return to project root
cd ../..
```

### 3. Deploy Services

```bash
# Start all services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Check service health
docker-compose -f docker-compose.prod.yml ps
```

### 4. Verify Deployment

```bash
# Check API health
curl http://localhost:3001/v1/health

# Check logs for errors
docker-compose -f docker-compose.prod.yml logs api
docker-compose -f docker-compose.prod.yml logs worker

# View API documentation
open http://localhost:3001/api-docs
```

### 5. Scale Workers (Docker Compose)

#### Method 1: Using Scale Script

```bash
# Make script executable
chmod +x scripts/scale-workers.sh

# Scale to 5 workers
./scripts/scale-workers.sh docker 5

# Scale to 10 workers
./scripts/scale-workers.sh docker 10
```

#### Method 2: Using Docker Compose Directly

```bash
# Scale to N workers
docker-compose -f docker-compose.prod.yml up -d --scale worker=5

# Verify scaling
docker-compose -f docker-compose.prod.yml ps worker
```

#### Method 3: Using Environment Variable

```bash
# Set in .env file
WORKER_REPLICAS=5

# Restart services
docker-compose -f docker-compose.prod.yml up -d
```

### 6. Stop Services

```bash
# Stop all services
docker-compose -f docker-compose.prod.yml down

# Stop and remove volumes (WARNING: deletes data)
docker-compose -f docker-compose.prod.yml down -v
```

## Kubernetes Deployment

See [k8s/README.md](k8s/README.md) for comprehensive Kubernetes deployment guide.

### Quick Start

```bash
# 1. Build and push images to your registry
docker build -t your-registry/volume-bot-api:v1.0.0 backend/api
docker build -t your-registry/volume-bot-worker:v1.0.0 backend/workers
docker push your-registry/volume-bot-api:v1.0.0
docker push your-registry/volume-bot-worker:v1.0.0

# 2. Create namespace and secrets
kubectl create namespace volume-bot
kubectl create secret generic volume-bot-secrets \
  --namespace=volume-bot \
  --from-literal=SUPABASE_URL='your-url' \
  --from-literal=SUPABASE_ANON_KEY='your-key' \
  --from-literal=MASTER_ENCRYPTION_KEY='your-key' \
  # ... (see k8s/README.md for full list)

# 3. Deploy using kubectl
kubectl apply -f k8s/

# 4. Or deploy using Kustomize
kubectl apply -k k8s/

# 5. Verify deployment
kubectl get pods -n volume-bot
kubectl get services -n volume-bot
```

### Scale Workers (Kubernetes)

#### Method 1: Using Scale Script

```bash
# Make script executable
chmod +x scripts/scale-workers.sh

# Scale to 10 workers
./scripts/scale-workers.sh k8s 10

# Scale to 20 workers
./scripts/scale-workers.sh k8s 20
```

#### Method 2: Using kubectl Directly

```bash
# Scale to N workers
kubectl scale deployment worker --replicas=10 -n volume-bot

# Verify scaling
kubectl get pods -n volume-bot -l component=worker
```

#### Method 3: Horizontal Pod Autoscaler (HPA)

HPA is configured by default and will automatically scale workers based on CPU/memory usage:

- **Min replicas:** 2
- **Max replicas:** 20
- **Target CPU:** 70%
- **Target Memory:** 80%

```bash
# View HPA status
kubectl get hpa worker-hpa -n volume-bot

# Describe HPA for details
kubectl describe hpa worker-hpa -n volume-bot

# Disable HPA (if you want manual control)
kubectl delete hpa worker-hpa -n volume-bot

# Re-enable HPA
kubectl apply -f k8s/worker-deployment.yaml
```

## Scaling Workers

### Why Scale Workers?

Workers process background jobs from Redis queues. Scale based on:

- **Queue size:** More items in queue = need more workers
- **Job processing time:** Slower jobs = need more workers
- **Campaign activity:** More active campaigns = need more workers
- **Resource utilization:** High CPU/memory = may need more workers

### Scaling Recommendations

| Active Campaigns | Recommended Workers | Notes |
|-----------------|--------------------|-----------------------------------------|
| 1-5             | 2-5                | Default for light usage                 |
| 5-20            | 5-10               | Medium usage                            |
| 20-50           | 10-20              | High usage                              |
| 50+             | 20+                | Very high usage, monitor queue backlog  |

### Monitoring Worker Load

#### Docker Compose

```bash
# View resource usage
docker stats

# Check specific worker stats
docker stats $(docker-compose -f docker-compose.prod.yml ps -q worker)

# View worker logs for job processing
docker-compose -f docker-compose.prod.yml logs -f worker | grep "Processing job"
```

#### Kubernetes

```bash
# View resource usage
kubectl top pods -n volume-bot -l component=worker

# View HPA metrics
kubectl get hpa worker-hpa -n volume-bot

# Check queue metrics via API
curl http://localhost:3001/v1/admin/metrics/queues
```

## Monitoring

### Health Checks

#### Docker Compose

```bash
# API health
curl http://localhost:3001/v1/health

# Check service health in Docker
docker-compose -f docker-compose.prod.yml ps
```

#### Kubernetes

```bash
# Pod health
kubectl get pods -n volume-bot

# Service health
kubectl get services -n volume-bot

# Describe pod for details
kubectl describe pod <pod-name> -n volume-bot
```

### Logs

#### Docker Compose

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f api
docker-compose -f docker-compose.prod.yml logs -f worker

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100 worker
```

#### Kubernetes

```bash
# All API pods
kubectl logs -f deployment/api -n volume-bot

# All worker pods
kubectl logs -f deployment/worker -n volume-bot

# Specific pod
kubectl logs -f <pod-name> -n volume-bot

# Previous container (if crashed)
kubectl logs --previous <pod-name> -n volume-bot
```

### Metrics

The API exposes metrics endpoints (requires admin authentication):

```bash
# Queue metrics
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3001/v1/admin/metrics/queues

# System metrics
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3001/v1/admin/metrics/system
```

### External Monitoring

If Sentry is configured (`SENTRY_DSN` set):
- Errors automatically reported to Sentry
- View errors at [sentry.io](https://sentry.io)
- Performance traces collected (sample rate configurable)

If OpenTelemetry is configured:
- Distributed traces sent to OTLP collector
- Integrate with Jaeger, Tempo, or Grafana Cloud

## Troubleshooting

### Workers Not Processing Jobs

1. **Check Redis connection:**
   ```bash
   # Docker Compose
   docker-compose -f docker-compose.prod.yml logs redis

   # Kubernetes
   kubectl logs -f deployment/worker -n volume-bot | grep -i redis
   ```

2. **Check queue status:**
   ```bash
   curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     http://localhost:3001/v1/admin/metrics/queues
   ```

3. **Check worker logs:**
   ```bash
   # Look for errors or job processing messages
   docker-compose -f docker-compose.prod.yml logs -f worker
   ```

### High Memory Usage

1. **Scale up resources:**
   - Docker Compose: Edit resource limits in `docker-compose.prod.yml`
   - Kubernetes: Edit resource limits in `k8s/worker-deployment.yaml`

2. **Scale out workers:**
   ```bash
   # Distribute load across more workers
   ./scripts/scale-workers.sh docker 10
   ```

3. **Reduce concurrency per worker:**
   ```bash
   # In .env
   WORKER_CONCURRENCY=3  # Default is 5
   ```

### Pods Not Starting (Kubernetes)

```bash
# Describe pod to see events
kubectl describe pod <pod-name> -n volume-bot

# Common issues:
# - Image pull errors: Check image name and registry credentials
# - Resource limits: Nodes may not have enough CPU/memory
# - Secret missing: Check secrets are created correctly
# - Config issues: Check environment variables in configmap/secret
```

### Database Connection Issues

1. **Verify Supabase credentials:**
   - Check `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Test connection manually

2. **Check network connectivity:**
   ```bash
   # Docker Compose
   docker-compose -f docker-compose.prod.yml exec api curl https://your-project.supabase.co

   # Kubernetes
   kubectl run curl-test --image=curlimages/curl --rm -it -n volume-bot -- \
     curl https://your-project.supabase.co
   ```

### Performance Issues

1. **Check resource usage:**
   ```bash
   # Docker
   docker stats

   # Kubernetes
   kubectl top pods -n volume-bot
   ```

2. **Check RPC endpoint performance:**
   - Use dedicated RPC provider (Helius, QuickNode)
   - Avoid public RPC endpoints for production

3. **Optimize worker concurrency:**
   - Balance `WORKER_CONCURRENCY` vs number of worker replicas
   - More replicas with lower concurrency often performs better

## Backup and Recovery

### Docker Compose

```bash
# Backup Redis data
docker run --rm -v volume-bot_redis_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/redis-backup-$(date +%Y%m%d).tar.gz /data

# Restore Redis data
docker run --rm -v volume-bot_redis_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/redis-backup-YYYYMMDD.tar.gz -C /
```

### Kubernetes

```bash
# Backup Redis PVC
kubectl get pvc redis-pvc -n volume-bot -o yaml > redis-pvc-backup.yaml

# Create backup pod to copy data
kubectl run redis-backup --image=alpine -n volume-bot --rm -it -- sh
# Inside pod: tar czf /backup/redis.tar.gz /data
```

### Database

If using managed Supabase:
- Automatic backups handled by Supabase
- Point-in-time recovery available
- See Supabase dashboard for backup settings

## Security Best Practices

1. **Never commit secrets to git**
   - Use `.env` files (gitignored)
   - Use secrets management tools (Vault, AWS Secrets Manager)

2. **Rotate secrets regularly**
   - Master encryption key
   - Redis password
   - API keys

3. **Use HTTPS/TLS**
   - Configure ingress with TLS certificates
   - Use cert-manager for automatic certificate renewal

4. **Limit network access**
   - Use firewall rules
   - Configure network policies (Kubernetes)
   - Whitelist IPs if possible

5. **Monitor and alert**
   - Set up Sentry for error tracking
   - Configure alerts for pod crashes, high resource usage
   - Monitor queue backlogs

6. **Keep images updated**
   - Regularly update base images
   - Scan images for vulnerabilities
   - Automate security patches

## Support

For additional help:
- Check application logs for specific errors
- Review [k8s/README.md](k8s/README.md) for Kubernetes-specific issues
- Check Sentry dashboard if configured
- Review queue metrics via admin API

## Next Steps

After deployment:
1. Set up monitoring and alerts
2. Configure backups
3. Test scaling under load
4. Set up CI/CD pipeline for automated deployments
5. Review and tune resource limits based on actual usage
