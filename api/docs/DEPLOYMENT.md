# Deployment Guide

Complete guide for deploying the Solana Volume Bot API and Workers to production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Deployment Options](#deployment-options)
  - [Docker Deployment](#docker-deployment)
  - [Cloud Deployment](#cloud-deployment)
  - [Manual Deployment](#manual-deployment)
- [Database Setup](#database-setup)
- [Secrets Management](#secrets-management)
- [Post-Deployment](#post-deployment)
- [Monitoring](#monitoring)
- [Scaling](#scaling)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before deploying, ensure you have:

- Node.js >= 20.x
- PostgreSQL database (Supabase recommended)
- Redis >= 7.x instance
- Solana RPC endpoints (mainnet/devnet)
- Environment secrets ready (see [Secrets Management](#secrets-management))

## Environment Variables

### Required Variables

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Supabase Authentication
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis (BullMQ)
REDIS_URL=redis://localhost:6379

# API Configuration
API_PORT=3001
NODE_ENV=production
LOG_LEVEL=info

# Solana RPC
SOLANA_RPC_PRIMARY=https://api.mainnet-beta.solana.com
SOLANA_RPC_FALLBACK=https://api.mainnet-beta.solana.com
SOLANA_RPC_PRIMARY_WS=wss://api.mainnet-beta.solana.com
SOLANA_RPC_FALLBACK_WS=wss://api.mainnet-beta.solana.com

# Master Encryption Key
MASTER_KEY=your-master-encryption-key-base64
```

### Optional Variables

```env
# Jito Integration
JITO_KEYPAIR_JSON=...
JITO_TIP_AMOUNT=0.001
JITO_BLOCK_ENGINE_URL=https://ny.mainnet.block-engine.jito.wtf

# Trading Configuration
BUY_LOWER_AMOUNT=0.001
BUY_UPPER_AMOUNT=0.002
SELL_LOWER_AMOUNT=100
SELL_UPPER_AMOUNT=100
SLIPPAGE_BPS=100

# Monitoring
SENTRY_DSN=https://...
OTEL_EXPORTER_OTLP_ENDPOINT=https://...

# CloudWatch Logging (optional)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
CLOUDWATCH_LOG_GROUP=/aws/solana-volume-bot
CLOUDWATCH_LOG_STREAM=api-{instance_id}
```

## Deployment Options

### Docker Deployment

#### 1. Build Docker Images

Create a `Dockerfile` in `backend/api`:

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build application
RUN pnpm build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/main.js"]
```

#### 2. Docker Compose (Development/Testing)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  api:
    build:
      context: ./backend/api
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - API_PORT=3001
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=${DATABASE_URL}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - SOLANA_RPC_PRIMARY=${SOLANA_RPC_PRIMARY}
      - MASTER_KEY=${MASTER_KEY}
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - app-network

  workers:
    build:
      context: ./backend/workers
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=${DATABASE_URL}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - SOLANA_RPC_PRIMARY=${SOLANA_RPC_PRIMARY}
      - MASTER_KEY=${MASTER_KEY}
    depends_on:
      - redis
    restart: unless-stopped
    deploy:
      replicas: 2
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  redis-data:

networks:
  app-network:
    driver: bridge
```

#### 3. Build and Run

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f api

# Scale workers
docker-compose up -d --scale workers=4

# Stop services
docker-compose down
```

### Cloud Deployment

#### AWS (ECS/Fargate)

1. **Build and push Docker images to ECR:**

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

# Build and tag
docker build -t solana-volume-bot-api ./backend/api
docker tag solana-volume-bot-api:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/solana-volume-bot-api:latest

# Push
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/solana-volume-bot-api:latest
```

2. **Create ECS Task Definition:**

See `infrastructure/aws/task-definition.json` for complete example.

3. **Deploy with ECS Service:**

```bash
aws ecs update-service --cluster my-cluster --service api --force-new-deployment
```

#### Google Cloud Platform (Cloud Run)

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/PROJECT_ID/solana-volume-bot-api

# Deploy
gcloud run deploy solana-volume-bot-api \
  --image gcr.io/PROJECT_ID/solana-volume-bot-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,API_PORT=8080" \
  --set-secrets="DATABASE_URL=database-url:latest,MASTER_KEY=master-key:latest"
```

#### Heroku

```bash
# Login
heroku login

# Create app
heroku create solana-volume-bot-api

# Add Redis addon
heroku addons:create heroku-redis:premium-0

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set DATABASE_URL=postgresql://...
heroku config:set SUPABASE_URL=https://...

# Deploy
git push heroku main

# Scale dynos
heroku ps:scale web=2 worker=4
```

### Manual Deployment (VPS/Dedicated Server)

#### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
sudo npm install -g pnpm

# Install PM2 for process management
sudo npm install -g pm2

# Install Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

#### 2. Deploy Application

```bash
# Clone repository
git clone https://github.com/your-org/solana-volume-bot.git
cd solana-volume-bot/backend/api

# Install dependencies
pnpm install --frozen-lockfile

# Build
pnpm build

# Create .env file
cp .env.example .env
nano .env  # Edit with production values
```

#### 3. Setup PM2 Ecosystem

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'api',
      script: 'dist/main.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        API_PORT: 3001,
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'workers',
      script: '../workers/dist/main.js',
      instances: 4,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/workers-error.log',
      out_file: './logs/workers-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
```

#### 4. Start with PM2

```bash
# Start applications
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup

# Monitor
pm2 monit

# View logs
pm2 logs
```

#### 5. Setup Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /api-docs {
        proxy_pass http://localhost:3001/api-docs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

#### 6. Setup SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

## Database Setup

### 1. Run Migrations

```bash
# Set DATABASE_URL
export DATABASE_URL=postgresql://user:password@host:5432/database

# Run migrations
cd backend/api
pnpm run migrate:up

# Verify migration status
pnpm run migrate:status
```

### 2. Verify Schema

```sql
-- Connect to database
psql $DATABASE_URL

-- List tables
\dt

-- Verify RLS policies
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public';
```

### 3. Seed Initial Data (Optional)

```bash
pnpm run db:seed
```

## Secrets Management

### Generate Master Encryption Key

```bash
# Generate master key
cd backend/api
pnpm run generate-master-key

# Output will be:
# MASTER_KEY=base64-encoded-key
```

### Store Secrets Securely

#### AWS Secrets Manager

```bash
aws secretsmanager create-secret \
  --name solana-volume-bot/master-key \
  --secret-string "your-base64-master-key"

aws secretsmanager create-secret \
  --name solana-volume-bot/database-url \
  --secret-string "postgresql://..."
```

#### Google Cloud Secret Manager

```bash
echo -n "your-base64-master-key" | gcloud secrets create master-key --data-file=-
echo -n "postgresql://..." | gcloud secrets create database-url --data-file=-
```

#### HashiCorp Vault

```bash
vault kv put secret/solana-volume-bot \
  master_key="your-base64-master-key" \
  database_url="postgresql://..."
```

## Post-Deployment

### 1. Verify Health

```bash
curl https://api.yourdomain.com/health
# Expected: {"status":"ok","timestamp":"..."}
```

### 2. Test Authentication

```bash
# Get JWT token from Supabase
TOKEN="your-jwt-token"

# Test protected endpoint
curl -H "Authorization: Bearer $TOKEN" https://api.yourdomain.com/v1/me
```

### 3. Verify Swagger Documentation

Visit: `https://api.yourdomain.com/api-docs`

### 4. Check Queue Workers

```bash
# Monitor Redis queues
redis-cli
> KEYS *

# View API metrics
curl https://api.yourdomain.com/metrics
```

## Monitoring

### Setup Prometheus Metrics

Metrics are exposed at `/metrics` endpoint.

### Setup Sentry Error Tracking

```env
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

### Setup CloudWatch Logging

```env
AWS_REGION=us-east-1
CLOUDWATCH_LOG_GROUP=/aws/solana-volume-bot
```

### Health Checks

- API: `GET /health`
- Database: Checked via health endpoint
- Redis: Checked via health endpoint
- RPC: Checked via health endpoint

## Scaling

### Horizontal Scaling

- **API**: Scale to multiple instances behind a load balancer
- **Workers**: Scale worker instances based on queue depth
- **Redis**: Use Redis Cluster for high availability

### Recommended Configuration

| Component | Development | Production | High Traffic |
|-----------|------------|------------|--------------|
| API       | 1 instance | 2-3 instances | 5+ instances |
| Workers   | 1 instance | 4-6 instances | 10+ instances |
| Redis     | Single node | Sentinel | Cluster |
| Database  | Shared | Dedicated | Pooled |

### Auto-scaling Rules

```yaml
# Kubernetes HPA example
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs api --lines 100

# Verify environment variables
printenv | grep -E "DATABASE_URL|REDIS_URL|SUPABASE"

# Test database connection
psql $DATABASE_URL -c "SELECT 1;"

# Test Redis connection
redis-cli ping
```

### Database Connection Issues

```bash
# Verify DATABASE_URL format
echo $DATABASE_URL

# Test connection
pg_isready -d $DATABASE_URL

# Check migrations
pnpm run migrate:status
```

### Redis Connection Issues

```bash
# Test Redis
redis-cli ping
redis-cli info

# Check Redis URL
echo $REDIS_URL
```

### High Memory Usage

```bash
# Check Node.js memory
pm2 monit

# Increase Node memory limit if needed
NODE_OPTIONS="--max-old-space-size=4096" pm2 start ecosystem.config.js
```

### Queue Backup

```bash
# Check queue depth
redis-cli
> LLEN bull:gather:wait
> LLEN bull:trade.buy:wait

# Scale workers
pm2 scale workers +2
```

## Rollback Procedures

### Application Rollback

```bash
# PM2
pm2 stop all
git checkout previous-stable-tag
pnpm install
pnpm build
pm2 restart all

# Docker
docker-compose down
docker-compose pull  # Pull previous version
docker-compose up -d
```

### Database Rollback

```bash
# Rollback last migration
pnpm run migrate:down

# Rollback multiple migrations
pnpm run migrate:down
pnpm run migrate:down
```

---

For additional help, see:
- [Database Migrations Guide](./DATABASE_MIGRATIONS.md)
- [API Documentation](../README.md)
- [Architecture Overview](../../IMPLEMENTATION_SUMMARY.md)
