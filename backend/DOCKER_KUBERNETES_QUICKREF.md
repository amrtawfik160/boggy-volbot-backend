# Docker & Kubernetes Quick Reference

Quick reference for common deployment and maintenance commands.

## Docker Compose Commands

### Deployment
```bash
# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Start specific service
docker-compose -f docker-compose.prod.yml up -d api

# Stop all services
docker-compose -f docker-compose.prod.yml down

# Stop and remove volumes
docker-compose -f docker-compose.prod.yml down -v

# Restart service
docker-compose -f docker-compose.prod.yml restart api
```

### Scaling
```bash
# Scale workers
docker-compose -f docker-compose.prod.yml up -d --scale worker=5
./scripts/scale-workers.sh docker 5

# View scaled services
docker-compose -f docker-compose.prod.yml ps worker
```

### Logs
```bash
# View all logs
docker-compose -f docker-compose.prod.yml logs -f

# View specific service
docker-compose -f docker-compose.prod.yml logs -f api

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100 worker

# Since time
docker-compose -f docker-compose.prod.yml logs --since 1h
```

### Health & Status
```bash
# Check service status
docker-compose -f docker-compose.prod.yml ps

# Resource usage
docker stats

# Disk usage
docker system df
```

### Updates
```bash
# Pull new images
docker-compose -f docker-compose.prod.yml pull

# Recreate containers
docker-compose -f docker-compose.prod.yml up -d --force-recreate

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build
```

## Kubernetes Commands

### Deployment
```bash
# Deploy all resources
kubectl apply -f k8s/
kubectl apply -k k8s/

# Deploy specific resource
kubectl apply -f k8s/api-deployment.yaml

# Delete all resources
kubectl delete namespace volume-bot

# Delete specific resource
kubectl delete -f k8s/api-deployment.yaml
```

### Scaling
```bash
# Scale deployment
kubectl scale deployment worker --replicas=10 -n volume-bot
./scripts/scale-workers.sh k8s 10

# View HPA status
kubectl get hpa -n volume-bot
kubectl describe hpa worker-hpa -n volume-bot

# Disable HPA (for manual scaling)
kubectl delete hpa worker-hpa -n volume-bot
```

### Pods
```bash
# List pods
kubectl get pods -n volume-bot

# List with more info
kubectl get pods -n volume-bot -o wide

# Describe pod
kubectl describe pod <pod-name> -n volume-bot

# Delete pod (will recreate)
kubectl delete pod <pod-name> -n volume-bot

# Get pod logs
kubectl logs <pod-name> -n volume-bot

# Follow logs
kubectl logs -f <pod-name> -n volume-bot

# Previous container logs
kubectl logs --previous <pod-name> -n volume-bot
```

### Deployments
```bash
# List deployments
kubectl get deployments -n volume-bot

# Describe deployment
kubectl describe deployment api -n volume-bot

# Restart deployment
kubectl rollout restart deployment/api -n volume-bot

# Check rollout status
kubectl rollout status deployment/api -n volume-bot

# View rollout history
kubectl rollout history deployment/api -n volume-bot

# Rollback deployment
kubectl rollout undo deployment/api -n volume-bot
kubectl rollout undo deployment/api --to-revision=2 -n volume-bot
```

### Logs
```bash
# Deployment logs
kubectl logs -f deployment/api -n volume-bot

# Specific pod logs
kubectl logs -f <pod-name> -n volume-bot

# All pods with label
kubectl logs -f -l component=worker -n volume-bot

# Multiple containers in pod
kubectl logs <pod-name> -c <container-name> -n volume-bot

# Last N lines
kubectl logs --tail=100 <pod-name> -n volume-bot
```

### Services & Networking
```bash
# List services
kubectl get services -n volume-bot

# Describe service
kubectl describe service api-service -n volume-bot

# List ingresses
kubectl get ingress -n volume-bot

# Describe ingress
kubectl describe ingress volume-bot-ingress -n volume-bot

# Port forward to local
kubectl port-forward service/api-service 3001:3001 -n volume-bot
kubectl port-forward deployment/api 3001:3001 -n volume-bot
```

### ConfigMaps & Secrets
```bash
# List ConfigMaps
kubectl get configmap -n volume-bot

# View ConfigMap
kubectl describe configmap volume-bot-config -n volume-bot
kubectl get configmap volume-bot-config -o yaml -n volume-bot

# List Secrets
kubectl get secrets -n volume-bot

# View Secret (base64 encoded)
kubectl get secret volume-bot-secrets -o yaml -n volume-bot

# Decode secret
kubectl get secret volume-bot-secrets -o jsonpath='{.data.REDIS_URL}' -n volume-bot | base64 -d
```

### Resource Usage
```bash
# Pod resources
kubectl top pods -n volume-bot

# Node resources
kubectl top nodes

# PVC usage
kubectl get pvc -n volume-bot
```

### Events
```bash
# View events
kubectl get events -n volume-bot

# Sort by time
kubectl get events -n volume-bot --sort-by='.lastTimestamp'

# Watch events
kubectl get events -n volume-bot --watch

# Events for specific resource
kubectl describe pod <pod-name> -n volume-bot | grep -A 10 Events:
```

### Updates
```bash
# Update image
kubectl set image deployment/api api=your-registry/volume-bot-api:v1.1.0 -n volume-bot

# Edit resource
kubectl edit deployment api -n volume-bot

# Apply changes
kubectl apply -f k8s/api-deployment.yaml

# Restart to pick up ConfigMap changes
kubectl rollout restart deployment/api -n volume-bot
```

### Debugging
```bash
# Execute command in pod
kubectl exec -it <pod-name> -n volume-bot -- sh
kubectl exec -it <pod-name> -n volume-bot -- redis-cli ping

# Copy files to/from pod
kubectl cp <pod-name>:/path/to/file ./local-file -n volume-bot
kubectl cp ./local-file <pod-name>:/path/to/file -n volume-bot

# Run temporary pod
kubectl run debug --image=alpine --rm -it -n volume-bot -- sh

# Test connectivity
kubectl run curl-test --image=curlimages/curl --rm -it -n volume-bot -- \
  curl http://api-service:3001/v1/health
```

### Maintenance
```bash
# Cordon node (prevent new pods)
kubectl cordon <node-name>

# Drain node (evict pods)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Uncordon node
kubectl uncordon <node-name>

# Delete completed pods
kubectl delete pods --field-selector status.phase=Succeeded -n volume-bot

# Delete evicted pods
kubectl delete pods --field-selector status.phase=Failed -n volume-bot
```

## Common Workflows

### Deploy New Version

**Docker Compose:**
```bash
# Build new version
docker build -t volume-bot-api:v1.1.0 backend/api
docker tag volume-bot-api:v1.1.0 volume-bot-api:latest

# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Verify
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f api
```

**Kubernetes:**
```bash
# Build and push
docker build -t your-registry/volume-bot-api:v1.1.0 backend/api
docker push your-registry/volume-bot-api:v1.1.0

# Update deployment
kubectl set image deployment/api api=your-registry/volume-bot-api:v1.1.0 -n volume-bot

# Watch rollout
kubectl rollout status deployment/api -n volume-bot

# Verify
kubectl get pods -n volume-bot
kubectl logs -f deployment/api -n volume-bot
```

### Troubleshoot Pod Not Starting

```bash
# Check pod status
kubectl get pods -n volume-bot

# Describe pod (look at Events)
kubectl describe pod <pod-name> -n volume-bot

# Check logs
kubectl logs <pod-name> -n volume-bot

# Check previous logs if crashed
kubectl logs --previous <pod-name> -n volume-bot

# Check events
kubectl get events -n volume-bot --sort-by='.lastTimestamp' | grep <pod-name>

# Common issues to check:
# - Image pull errors (check image name, registry credentials)
# - Resource limits (not enough CPU/memory on node)
# - Missing secrets/configmaps
# - Failed health checks
```

### Check Performance Issues

**Docker Compose:**
```bash
# Resource usage
docker stats

# Specific service stats
docker stats $(docker-compose -f docker-compose.prod.yml ps -q worker)

# Check logs for slow operations
docker-compose -f docker-compose.prod.yml logs worker | grep "took.*ms"
```

**Kubernetes:**
```bash
# Resource usage
kubectl top pods -n volume-bot

# HPA status
kubectl get hpa -n volume-bot

# Describe for details
kubectl describe hpa worker-hpa -n volume-bot

# Check metrics
kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/volume-bot/pods
```

### Emergency Rollback

**Docker Compose:**
```bash
# Tag previous version as latest
docker tag volume-bot-api:v1.0.0 volume-bot-api:latest

# Restart with old version
docker-compose -f docker-compose.prod.yml up -d --force-recreate
```

**Kubernetes:**
```bash
# Rollback to previous version
kubectl rollout undo deployment/api -n volume-bot

# Rollback to specific version
kubectl rollout history deployment/api -n volume-bot
kubectl rollout undo deployment/api --to-revision=2 -n volume-bot

# Verify rollback
kubectl rollout status deployment/api -n volume-bot
```

## Health Check URLs

```bash
# API health
curl http://localhost:3001/v1/health
curl https://your-domain.com/v1/health

# API documentation
open http://localhost:3001/api-docs
open https://your-domain.com/api-docs

# Queue metrics (requires admin auth)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3001/v1/admin/metrics/queues
```

## Resource Limits Reference

### Docker Compose

Configured in `docker-compose.prod.yml`:
```yaml
API:
  CPU: 500m - 1000m
  Memory: 512Mi - 1Gi

Workers:
  CPU: 500m - 1000m
  Memory: 512Mi - 1Gi

Redis:
  CPU: 250m - 500m
  Memory: 256Mi - 512Mi
```

### Kubernetes

Configured in `k8s/*-deployment.yaml`:
```yaml
API Pods:
  Request: 500m CPU, 512Mi memory
  Limit: 1000m CPU, 1Gi memory
  Replicas: 2-10 (HPA)

Worker Pods:
  Request: 500m CPU, 512Mi memory
  Limit: 1000m CPU, 1Gi memory
  Replicas: 2-20 (HPA)

Redis Pod:
  Request: 250m CPU, 256Mi memory
  Limit: 500m CPU, 512Mi memory
  Replicas: 1
```

## Helpful Aliases

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Docker Compose
alias dcp='docker-compose -f docker-compose.prod.yml'
alias dcup='docker-compose -f docker-compose.prod.yml up -d'
alias dcdown='docker-compose -f docker-compose.prod.yml down'
alias dclogs='docker-compose -f docker-compose.prod.yml logs -f'
alias dcps='docker-compose -f docker-compose.prod.yml ps'

# Kubernetes
alias k='kubectl'
alias kn='kubectl config set-context --current --namespace='
alias kvb='kubectl -n volume-bot'
alias kgp='kubectl get pods -n volume-bot'
alias kgd='kubectl get deployments -n volume-bot'
alias klf='kubectl logs -f -n volume-bot'
alias kdp='kubectl describe pod -n volume-bot'
```

## Quick Diagnostic Script

Save as `scripts/diagnose.sh`:

```bash
#!/bin/bash
echo "=== Docker Compose Health ==="
docker-compose -f docker-compose.prod.yml ps

echo -e "\n=== Resource Usage ==="
docker stats --no-stream

echo -e "\n=== Recent Errors ==="
docker-compose -f docker-compose.prod.yml logs --tail=50 | grep -i error

echo -e "\n=== API Health ==="
curl -s http://localhost:3001/v1/health | jq
```

For Kubernetes:

```bash
#!/bin/bash
echo "=== Pod Health ==="
kubectl get pods -n volume-bot

echo -e "\n=== Resource Usage ==="
kubectl top pods -n volume-bot

echo -e "\n=== HPA Status ==="
kubectl get hpa -n volume-bot

echo -e "\n=== Recent Events ==="
kubectl get events -n volume-bot --sort-by='.lastTimestamp' | tail -10

echo -e "\n=== API Health ==="
kubectl run curl-test --image=curlimages/curl --rm -i -n volume-bot -- \
  curl -s http://api-service:3001/v1/health
```
