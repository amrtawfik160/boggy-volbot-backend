# Maintenance Guide

This guide covers routine maintenance procedures for the Solana Volume Bot in production.

## Table of Contents

- [Routine Maintenance Tasks](#routine-maintenance-tasks)
- [Updates and Upgrades](#updates-and-upgrades)
- [Database Maintenance](#database-maintenance)
- [Redis Maintenance](#redis-maintenance)
- [Log Management](#log-management)
- [Security Updates](#security-updates)
- [Performance Tuning](#performance-tuning)
- [Disaster Recovery](#disaster-recovery)

## Routine Maintenance Tasks

### Daily Tasks

#### 1. Check Service Health

**Docker Compose:**
```bash
# Check all services are running
docker-compose -f docker-compose.prod.yml ps

# Check logs for errors
docker-compose -f docker-compose.prod.yml logs --tail=100 | grep -i error

# Check resource usage
docker stats --no-stream
```

**Kubernetes:**
```bash
# Check pod health
kubectl get pods -n volume-bot

# Check for crashlooping pods
kubectl get pods -n volume-bot | grep -E 'CrashLoop|Error'

# Check events for issues
kubectl get events -n volume-bot --sort-by='.lastTimestamp' | tail -20
```

#### 2. Monitor Queue Health

```bash
# Check queue metrics via API
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://your-domain.com/v1/admin/metrics/queues | jq

# Look for:
# - High waiting counts (indicates backlog)
# - High failed counts (indicates processing issues)
# - Low active counts with high waiting (may need more workers)
```

#### 3. Check Error Rates

If Sentry is configured:
- Review Sentry dashboard for new errors
- Check error trends and spikes
- Investigate recurring errors

### Weekly Tasks

#### 1. Review Resource Usage

**Docker Compose:**
```bash
# Check disk usage
docker system df

# Check volume sizes
docker volume ls
du -sh /var/lib/docker/volumes/*
```

**Kubernetes:**
```bash
# Check pod resource usage trends
kubectl top pods -n volume-bot

# Check node resources
kubectl top nodes

# Check PVC usage
kubectl get pvc -n volume-bot
```

#### 2. Review Logs

```bash
# Check for patterns in errors
docker-compose -f docker-compose.prod.yml logs --since 7d | grep -i error | sort | uniq -c | sort -rn

# Check for slow operations
docker-compose -f docker-compose.prod.yml logs --since 7d | grep -i "took.*ms" | sort -rn
```

#### 3. Verify Backups

```bash
# Check Redis backup exists and is recent
ls -lh redis-backup-*.tar.gz
find . -name "redis-backup-*.tar.gz" -mtime -7

# Verify backup integrity (optional)
tar tzf redis-backup-latest.tar.gz > /dev/null && echo "Backup OK"
```

### Monthly Tasks

#### 1. Review and Rotate Logs

**Docker Compose:**
```bash
# Configure log rotation in docker-compose.prod.yml
# Already configured with 10m max size, 3 files

# Or manually clean old logs
docker-compose -f docker-compose.prod.yml logs --no-log-prefix > logs-backup-$(date +%Y%m).log
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

**Kubernetes:**
```bash
# Kubernetes automatically rotates logs
# Check pod logs don't consume too much disk
kubectl logs --tail=1000 deployment/api -n volume-bot | wc -l
```

#### 2. Security Audit

```bash
# Scan Docker images for vulnerabilities
docker scout cves volume-bot-api:latest
docker scout cves volume-bot-worker:latest

# Or use Trivy
trivy image volume-bot-api:latest
trivy image volume-bot-worker:latest

# Check for outdated dependencies
cd backend/api && npm audit
cd backend/workers && npm audit
```

#### 3. Performance Review

- Review response time metrics
- Check for slow queries or operations
- Analyze worker efficiency
- Review scaling patterns and adjust HPA if needed

## Updates and Upgrades

### Application Updates

#### Docker Compose

```bash
# 1. Build new images with version tags
cd backend/api
docker build -t volume-bot-api:v1.1.0 .
docker tag volume-bot-api:v1.1.0 volume-bot-api:latest

cd ../workers
docker build -t volume-bot-worker:v1.1.0 .
docker tag volume-bot-worker:v1.1.0 volume-bot-worker:latest

# 2. Update with zero downtime (creates new containers before stopping old)
cd ../..
docker-compose -f docker-compose.prod.yml up -d

# 3. Monitor logs for issues
docker-compose -f docker-compose.prod.yml logs -f

# 4. Rollback if needed
docker tag volume-bot-api:v1.0.0 volume-bot-api:latest
docker tag volume-bot-worker:v1.0.0 volume-bot-worker:latest
docker-compose -f docker-compose.prod.yml up -d --force-recreate
```

#### Kubernetes

```bash
# 1. Build and push new images
docker build -t your-registry/volume-bot-api:v1.1.0 backend/api
docker build -t your-registry/volume-bot-worker:v1.1.0 backend/workers
docker push your-registry/volume-bot-api:v1.1.0
docker push your-registry/volume-bot-worker:v1.1.0

# 2. Update deployments (rolling update)
kubectl set image deployment/api api=your-registry/volume-bot-api:v1.1.0 -n volume-bot
kubectl set image deployment/worker worker=your-registry/volume-bot-worker:v1.1.0 -n volume-bot

# 3. Watch rollout progress
kubectl rollout status deployment/api -n volume-bot
kubectl rollout status deployment/worker -n volume-bot

# 4. Verify new pods are healthy
kubectl get pods -n volume-bot
kubectl logs -f deployment/api -n volume-bot

# 5. Rollback if issues detected
kubectl rollout undo deployment/api -n volume-bot
kubectl rollout undo deployment/worker -n volume-bot
```

### Database Migrations

If using self-hosted Postgres (Supabase handles this automatically):

```bash
# 1. Backup database first
pg_dump -h localhost -U postgres volumebot > backup-$(date +%Y%m%d).sql

# 2. Run migrations
docker-compose -f docker-compose.prod.yml exec api npm run migrate:up

# Or for Kubernetes
kubectl run migrate --image=your-registry/volume-bot-api:latest \
  --restart=Never -n volume-bot \
  --env="SUPABASE_URL=$SUPABASE_URL" \
  -- npm run migrate:up

# 3. Verify migration status
docker-compose -f docker-compose.prod.yml exec api npm run migrate:status
```

### Dependency Updates

```bash
# 1. Check for updates
cd backend/api
npm outdated

# 2. Update dependencies (carefully!)
npm update

# 3. Test thoroughly in staging
npm test
npm run build

# 4. Update lock file
npm install

# 5. Rebuild and deploy
docker build -t volume-bot-api:v1.1.1 .
```

## Database Maintenance

### Supabase (Recommended)

Supabase handles most maintenance automatically:
- Automatic backups
- Point-in-time recovery
- Performance optimization
- Security patches

**Manual tasks:**
- Review query performance in Supabase dashboard
- Check table sizes and growth trends
- Optimize indexes if needed

### Self-Hosted Postgres

#### Vacuum and Analyze

```bash
# Run vacuum to reclaim space
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d volumebot -c "VACUUM ANALYZE;"

# Check table sizes
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d volumebot -c "
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;"
```

#### Backup and Restore

```bash
# Backup database
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres volumebot | gzip > backup-$(date +%Y%m%d).sql.gz

# Restore database
gunzip < backup-YYYYMMDD.sql.gz | docker-compose -f docker-compose.prod.yml exec -T postgres psql -U postgres volumebot

# Verify restore
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d volumebot -c "\dt"
```

## Redis Maintenance

### Monitor Redis Memory

```bash
# Check Redis memory usage
docker-compose -f docker-compose.prod.yml exec redis redis-cli INFO memory

# Or in Kubernetes
kubectl exec -it deployment/redis -n volume-bot -- redis-cli INFO memory
```

### Redis Backup

**Docker Compose:**
```bash
# Trigger save
docker-compose -f docker-compose.prod.yml exec redis redis-cli BGSAVE

# Backup Redis data volume
docker run --rm \
  -v volume-bot_redis_data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/redis-backup-$(date +%Y%m%d).tar.gz /data

# Restore Redis data
docker run --rm \
  -v volume-bot_redis_data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar xzf /backup/redis-backup-YYYYMMDD.tar.gz -C /
```

**Kubernetes:**
```bash
# Trigger save
kubectl exec -it deployment/redis -n volume-bot -- redis-cli BGSAVE

# Backup PVC (more complex, use Velero or similar)
# Or use Redis Cloud with automatic backups
```

### Clear Redis Cache

```bash
# Clear all keys (DANGEROUS!)
docker-compose -f docker-compose.prod.yml exec redis redis-cli FLUSHALL

# Clear specific pattern
docker-compose -f docker-compose.prod.yml exec redis redis-cli --scan --pattern "cache:*" | xargs redis-cli DEL
```

## Log Management

### Docker Compose Log Rotation

Already configured in `docker-compose.prod.yml`:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### Export Logs for Analysis

```bash
# Export last 24 hours of logs
docker-compose -f docker-compose.prod.yml logs --since 24h > logs-$(date +%Y%m%d).log

# Export specific service logs
docker-compose -f docker-compose.prod.yml logs --since 7d worker > worker-logs-$(date +%Y%m%d).log

# Compress old logs
gzip logs-*.log
```

### Kubernetes Logging

Consider using a log aggregation solution:
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Loki + Grafana**
- **AWS CloudWatch** (if on AWS)
- **Datadog** or **New Relic**

## Security Updates

### Check for Vulnerabilities

```bash
# Scan Docker images
docker scout cves volume-bot-api:latest
docker scout cves volume-bot-worker:latest

# Or use Trivy
trivy image volume-bot-api:latest --severity HIGH,CRITICAL

# Check npm dependencies
cd backend/api && npm audit
cd backend/workers && npm audit

# Fix vulnerabilities
npm audit fix
```

### Update Base Images

```bash
# Pull latest base images
docker pull node:20-alpine

# Rebuild with latest base
docker build -t volume-bot-api:v1.0.1 backend/api --no-cache
docker build -t volume-bot-worker:v1.0.1 backend/workers --no-cache

# Test and deploy
```

### Rotate Secrets

```bash
# Generate new encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Update .env with new key
# MASTER_ENCRYPTION_KEY=new_key_here

# Run key rotation script (if implemented)
npm run rotate-master-key

# Restart services with new key
docker-compose -f docker-compose.prod.yml restart
```

## Performance Tuning

### Optimize Worker Concurrency

```bash
# Test different concurrency settings
WORKER_CONCURRENCY=3  # Lower concurrency, more workers
WORKER_CONCURRENCY=5  # Default
WORKER_CONCURRENCY=10 # Higher concurrency, fewer workers

# Monitor and choose optimal setting
docker-compose -f docker-compose.prod.yml up -d
docker stats
```

### Optimize Redis

```bash
# Check slow queries
docker-compose -f docker-compose.prod.yml exec redis redis-cli SLOWLOG GET 10

# Adjust maxmemory if needed (in docker-compose.prod.yml)
--maxmemory 1gb  # Increase from default 512mb

# Enable more aggressive eviction
--maxmemory-policy allkeys-lru
```

### Database Query Optimization

```bash
# Find slow queries in Postgres
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d volumebot -c "
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;"

# Add indexes for frequently queried columns
# Review and add in database-schema.sql
```

## Disaster Recovery

### Complete System Backup

```bash
# 1. Backup database
# If using Supabase: handled automatically
# If self-hosted:
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres volumebot > db-backup.sql

# 2. Backup Redis
docker run --rm -v volume-bot_redis_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/redis-backup.tar.gz /data

# 3. Backup configuration
cp .env env-backup
cp docker-compose.prod.yml docker-compose-backup.yml

# 4. Store backups securely offsite
# Upload to S3, Google Cloud Storage, etc.
```

### Complete System Restore

```bash
# 1. Deploy infrastructure
docker-compose -f docker-compose.prod.yml up -d

# 2. Restore Redis
docker run --rm -v volume-bot_redis_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/redis-backup.tar.gz -C /

# 3. Restore database (if self-hosted)
cat db-backup.sql | docker-compose -f docker-compose.prod.yml exec -T postgres psql -U postgres volumebot

# 4. Restart services
docker-compose -f docker-compose.prod.yml restart

# 5. Verify everything is working
curl http://localhost:3001/v1/health
```

### Automated Backup Script

```bash
#!/bin/bash
# Save as scripts/backup.sh

DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/path/to/backups/$DATE"
mkdir -p "$BACKUP_DIR"

# Backup Redis
docker run --rm -v volume-bot_redis_data:/data -v "$BACKUP_DIR":/backup alpine \
  tar czf /backup/redis-backup.tar.gz /data

# Backup configuration
cp .env "$BACKUP_DIR/env"
cp docker-compose.prod.yml "$BACKUP_DIR/docker-compose.yml"

# Upload to S3 (optional)
# aws s3 sync "$BACKUP_DIR" s3://your-bucket/backups/$DATE/

echo "Backup completed: $BACKUP_DIR"

# Clean up old backups (keep last 30 days)
find /path/to/backups -type d -mtime +30 -exec rm -rf {} +
```

### Set Up Automated Backups

```bash
# Add to crontab
crontab -e

# Run backup daily at 2 AM
0 2 * * * /path/to/scripts/backup.sh >> /var/log/backup.log 2>&1
```

## Health Checks and Monitoring

### Set Up Monitoring Alerts

**Using Prometheus + Alertmanager:**
```yaml
# prometheus-alerts.yml
groups:
  - name: volume-bot
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High error rate detected"

      - alert: HighQueueBacklog
        expr: redis_queue_waiting > 1000
        for: 10m
        annotations:
          summary: "Queue backlog is high"

      - alert: PodCrashLooping
        expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
        annotations:
          summary: "Pod is crash looping"
```

**Using Sentry Alerts:**
- Configure alerts in Sentry dashboard
- Set thresholds for error rates
- Configure notifications (Slack, email, PagerDuty)

### Uptime Monitoring

Use external monitoring services:
- **UptimeRobot**: [uptimerobot.com](https://uptimerobot.com)
- **Pingdom**: [pingdom.com](https://pingdom.com)
- **StatusCake**: [statuscake.com](https://statuscake.com)

Configure health check endpoint:
```
URL: https://your-domain.com/v1/health
Method: GET
Expected: 200 OK
Interval: 5 minutes
```

## Troubleshooting Common Issues

See [DEPLOYMENT.md](DEPLOYMENT.md#troubleshooting) for detailed troubleshooting guide.

### Quick Reference

```bash
# Check service health
docker-compose -f docker-compose.prod.yml ps
kubectl get pods -n volume-bot

# View logs
docker-compose -f docker-compose.prod.yml logs -f [service]
kubectl logs -f deployment/[service] -n volume-bot

# Restart service
docker-compose -f docker-compose.prod.yml restart [service]
kubectl rollout restart deployment/[service] -n volume-bot

# Check resource usage
docker stats
kubectl top pods -n volume-bot

# Test connectivity
curl http://localhost:3001/v1/health
```

## Support and Further Reading

- [DEPLOYMENT.md](DEPLOYMENT.md) - Initial deployment guide
- [k8s/README.md](k8s/README.md) - Kubernetes-specific documentation
- [backend/MONITORING.md](backend/MONITORING.md) - Monitoring and observability
- Application logs - Check logs first for specific errors
- Sentry dashboard - Review error patterns and trends

## Maintenance Checklist

**Daily:**
- [ ] Check service health
- [ ] Monitor queue metrics
- [ ] Review error rates

**Weekly:**
- [ ] Review resource usage trends
- [ ] Check logs for patterns
- [ ] Verify backups are running

**Monthly:**
- [ ] Rotate and archive logs
- [ ] Security audit and updates
- [ ] Performance review and tuning
- [ ] Test disaster recovery procedure

**Quarterly:**
- [ ] Review and update documentation
- [ ] Dependency updates and testing
- [ ] Capacity planning review
- [ ] Security penetration testing (if applicable)
