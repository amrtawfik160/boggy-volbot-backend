# Kubernetes Deployment Guide

This directory contains Kubernetes manifests for deploying the Solana Volume Bot to a production Kubernetes cluster.

## Prerequisites

- Kubernetes cluster (v1.24+)
- `kubectl` configured to access your cluster
- Container registry for storing images (Docker Hub, ECR, GCR, etc.)
- Ingress controller (nginx-ingress or AWS ALB)
- cert-manager for automatic TLS certificates (optional but recommended)
- Horizontal Pod Autoscaler metrics (metrics-server)

## Quick Start

### 1. Build and Push Docker Images

```bash
# Build images
cd backend/api
docker build -t your-registry/volume-bot-api:v1.0.0 .

cd ../workers
docker build -t your-registry/volume-bot-worker:v1.0.0 .

# Push to registry
docker push your-registry/volume-bot-api:v1.0.0
docker push your-registry/volume-bot-worker:v1.0.0
```

### 2. Update Image References

Edit `api-deployment.yaml` and `worker-deployment.yaml` to use your image registry:

```yaml
image: your-registry/volume-bot-api:v1.0.0
image: your-registry/volume-bot-worker:v1.0.0
```

### 3. Configure Secrets

**IMPORTANT:** Never commit real secrets to git!

Option A: Edit `secret.yaml` directly (not recommended for production):
```bash
# Edit k8s/secret.yaml with your actual credentials
kubectl apply -f k8s/secret.yaml
```

Option B: Use kubectl create secret (recommended):
```bash
kubectl create namespace volume-bot

kubectl create secret generic volume-bot-secrets \
  --namespace=volume-bot \
  --from-literal=SUPABASE_URL='your-url' \
  --from-literal=SUPABASE_ANON_KEY='your-key' \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY='your-key' \
  --from-literal=MASTER_ENCRYPTION_KEY='your-key' \
  --from-literal=REDIS_URL='redis://:password@redis-service:6379' \
  --from-literal=REDIS_PASSWORD='your-password' \
  --from-literal=SOLANA_RPC_URL='your-rpc-url' \
  --from-literal=RPC_ENDPOINT='your-rpc-url' \
  --from-literal=RPC_WEBSOCKET_ENDPOINT='your-ws-url' \
  --from-literal=JITO_KEY='your-jito-key' \
  --from-literal=SENTRY_DSN='your-sentry-dsn' \
  --from-literal=OTEL_EXPORTER_OTLP_ENDPOINT='' \
  --from-literal=OTEL_EXPORTER_OTLP_HEADERS=''
```

Option C: Use External Secrets Operator (best for production):
```bash
# Install External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets-system --create-namespace

# Configure SecretStore (example in secret.yaml comments)
```

### 4. Deploy to Kubernetes

Deploy all resources in order:

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create ConfigMap
kubectl apply -f k8s/configmap.yaml

# Create Secrets (if using Option A)
kubectl apply -f k8s/secret.yaml

# Deploy Redis
kubectl apply -f k8s/redis-deployment.yaml

# Wait for Redis to be ready
kubectl wait --for=condition=ready pod -l app=redis -n volume-bot --timeout=120s

# Deploy API
kubectl apply -f k8s/api-deployment.yaml

# Wait for API to be ready
kubectl wait --for=condition=ready pod -l component=api -n volume-bot --timeout=120s

# Deploy Workers
kubectl apply -f k8s/worker-deployment.yaml

# Deploy Ingress (configure domain first)
kubectl apply -f k8s/ingress.yaml
```

### 5. Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n volume-bot

# Check services
kubectl get services -n volume-bot

# Check ingress
kubectl get ingress -n volume-bot

# View logs
kubectl logs -f deployment/api -n volume-bot
kubectl logs -f deployment/worker -n volume-bot

# Check HPA status
kubectl get hpa -n volume-bot
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Internet                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼───────┐
                    │   Ingress    │
                    │ (nginx/ALB)  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ API Service  │
                    │  (ClusterIP) │
                    └──────┬───────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
     ┌────▼────┐      ┌────▼────┐     ┌────▼────┐
     │ API Pod │      │ API Pod │ ... │ API Pod │
     │  (HPA)  │      │  (HPA)  │     │  (HPA)  │
     └────┬────┘      └────┬────┘     └────┬────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
                    ┌──────▼───────┐
                    │    Redis     │
                    │   Service    │
                    └──────┬───────┘
                           │
                      ┌────▼─────┐
                      │ Redis Pod│
                      │   (PVC)  │
                      └────┬─────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
     ┌────▼────┐      ┌────▼────┐     ┌────▼────┐
     │Worker Pod│     │Worker Pod│ ... │Worker Pod│
     │  (HPA)   │     │  (HPA)   │     │  (HPA)   │
     └──────────┘     └──────────┘     └──────────┘
```

## Scaling

### Manual Scaling

```bash
# Scale API
kubectl scale deployment api --replicas=5 -n volume-bot

# Scale Workers
kubectl scale deployment worker --replicas=10 -n volume-bot
```

### Automatic Scaling (HPA)

HPA is configured for both API and workers:

**API HPA:**
- Min: 2 replicas
- Max: 10 replicas
- Target: 70% CPU, 80% memory

**Worker HPA:**
- Min: 2 replicas
- Max: 20 replicas
- Target: 70% CPU, 80% memory
- Scale up: 50% increase every 60s
- Scale down: 25% decrease every 60s (5min stabilization)

```bash
# View HPA status
kubectl get hpa -n volume-bot

# Describe HPA for details
kubectl describe hpa api-hpa -n volume-bot
kubectl describe hpa worker-hpa -n volume-bot
```

## Monitoring

### View Logs

```bash
# All API logs
kubectl logs -f deployment/api -n volume-bot

# All Worker logs
kubectl logs -f deployment/worker -n volume-bot

# Specific pod logs
kubectl logs -f <pod-name> -n volume-bot

# Previous container logs (if crashed)
kubectl logs --previous <pod-name> -n volume-bot
```

### Resource Usage

```bash
# Pod resource usage
kubectl top pods -n volume-bot

# Node resource usage
kubectl top nodes
```

### Events

```bash
# View recent events
kubectl get events -n volume-bot --sort-by='.lastTimestamp'

# Watch events in real-time
kubectl get events -n volume-bot --watch
```

## Updates and Rollbacks

### Rolling Update

```bash
# Update image
kubectl set image deployment/api api=your-registry/volume-bot-api:v1.1.0 -n volume-bot
kubectl set image deployment/worker worker=your-registry/volume-bot-worker:v1.1.0 -n volume-bot

# Check rollout status
kubectl rollout status deployment/api -n volume-bot
kubectl rollout status deployment/worker -n volume-bot

# View rollout history
kubectl rollout history deployment/api -n volume-bot
```

### Rollback

```bash
# Rollback to previous version
kubectl rollout undo deployment/api -n volume-bot
kubectl rollout undo deployment/worker -n volume-bot

# Rollback to specific revision
kubectl rollout undo deployment/api --to-revision=2 -n volume-bot
```

## Maintenance

### Drain Node for Maintenance

```bash
# Cordon node (prevent new pods)
kubectl cordon <node-name>

# Drain node (evict pods gracefully)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Uncordon when ready
kubectl uncordon <node-name>
```

### Database Migrations

If using self-hosted Postgres (not recommended), run migrations as a Job:

```bash
# Create migration job
kubectl create job --from=cronjob/migrations migrate-$(date +%s) -n volume-bot

# Or run one-time migration pod
kubectl run migrate --image=your-registry/volume-bot-api:v1.0.0 \
  --restart=Never \
  --namespace=volume-bot \
  --env="SUPABASE_URL=$SUPABASE_URL" \
  -- npm run migrate:up
```

## Troubleshooting

### Pods Not Starting

```bash
# Describe pod to see events
kubectl describe pod <pod-name> -n volume-bot

# Check pod logs
kubectl logs <pod-name> -n volume-bot

# Check resource constraints
kubectl top pods -n volume-bot
```

### Connection Issues

```bash
# Test Redis connectivity
kubectl run redis-test --image=redis:7-alpine --rm -it --restart=Never -n volume-bot -- redis-cli -h redis-service ping

# Test API connectivity
kubectl run curl-test --image=curlimages/curl --rm -it --restart=Never -n volume-bot -- curl http://api-service:3001/v1/health
```

### HPA Not Scaling

```bash
# Check metrics-server is running
kubectl get deployment metrics-server -n kube-system

# Check HPA can get metrics
kubectl get hpa -n volume-bot
kubectl describe hpa worker-hpa -n volume-bot
```

## Cleanup

```bash
# Delete all resources
kubectl delete namespace volume-bot

# Or delete individually
kubectl delete -f k8s/
```

## Production Recommendations

1. **Use External Secrets Management**
   - AWS Secrets Manager
   - HashiCorp Vault
   - External Secrets Operator

2. **Use Managed Services**
   - Managed Supabase (not self-hosted Postgres)
   - Managed Redis (Redis Cloud, AWS ElastiCache)

3. **Enable Monitoring**
   - Prometheus + Grafana
   - Datadog, New Relic, or similar
   - Set up alerts for pod crashes, high CPU/memory

4. **Implement Backup Strategy**
   - Regular Redis snapshots
   - Database backups (Supabase handles this)

5. **Security**
   - Network Policies to restrict pod communication
   - Pod Security Policies/Standards
   - Regular security scanning of images
   - Rotate secrets regularly

6. **High Availability**
   - Run on multiple nodes
   - Use node affinity/anti-affinity
   - Configure pod disruption budgets

7. **Resource Limits**
   - Always set requests and limits
   - Monitor and adjust based on actual usage

8. **Ingress/Load Balancer**
   - Configure SSL/TLS certificates
   - Set up WAF rules if needed
   - Configure rate limiting
   - Enable DDoS protection

## Support

For issues or questions:
- Check logs: `kubectl logs -f deployment/api -n volume-bot`
- Check events: `kubectl get events -n volume-bot`
- Review application logs in Sentry (if configured)
