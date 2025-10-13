# CI/CD Quick Reference

Quick commands and workflows for developers.

## Workflows Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    PR Workflow                               │
├─────────────────────────────────────────────────────────────┤
│  1. Create PR → main/develop                                │
│  2. Lint & Type Check (auto) ──→ 2-3 min                   │
│  3. Tests (auto) ──────────────→ 5-7 min                    │
│  4. Review & Fix Issues                                      │
│  5. Merge PR                                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  Main Branch Workflow                        │
├─────────────────────────────────────────────────────────────┤
│  1. Push to main                                             │
│  2. Tests (auto) ──────────────→ 5-7 min                    │
│  3. Build Images (auto) ───────→ 10-15 min                  │
│     ├─ Frontend Image                                        │
│     ├─ API Image                                             │
│     └─ Workers Image                                         │
│  4. Deploy to Staging (auto*) ─→ 3-5 min                    │
│  5. Run Migrations (auto**) ───→ 2-3 min                    │
└─────────────────────────────────────────────────────────────┘
     * Requires setup    ** Only if migrations changed
```

## Common Commands

### Check Workflow Status
```bash
# View all workflows
gh workflow list

# View recent runs
gh run list

# Watch a specific run
gh run watch
```

### Trigger Manual Workflows
```bash
# Run migrations on staging
gh workflow run database-migrations.yml \
  -f environment=staging \
  -f migration_action=up \
  -f dry_run=false

# Run migrations on production (CAREFUL!)
gh workflow run database-migrations.yml \
  -f environment=production \
  -f migration_action=up \
  -f dry_run=true  # Test first!
```

### Docker Images
```bash
# List available images
gh api /user/packages?package_type=container

# Pull latest images
docker pull ghcr.io/OWNER/REPO/frontend:latest
docker pull ghcr.io/OWNER/REPO/api:latest
docker pull ghcr.io/OWNER/REPO/workers:latest

# Pull specific commit
docker pull ghcr.io/OWNER/REPO/api:main-abc123
```

### Local Testing
```bash
# Run linting (same as CI)
cd frontend && npm run lint
cd backend/api && npm run lint && npm run type-check
cd backend/workers && npm run lint && npm run type-check

# Run tests (same as CI)
cd frontend && npm run test
cd backend/api && npm run test
cd backend/workers && npm run test

# Build Docker images (same as CI)
docker build -t test-frontend ./frontend
docker build -t test-api ./backend/api
docker build -t test-workers ./backend/workers
```

## Workflow Triggers

| Event | Lint & Type | Test | Build & Deploy | Migrations |
|-------|-------------|------|----------------|------------|
| PR → main/develop | ✅ | ✅ | ❌ | ❌ |
| Push → main | ❌ | ✅ | ✅ | ✅* |
| Migration files change | ❌ | ❌ | ❌ | ✅ |
| Manual trigger | ❌ | ❌ | ❌ | ✅ |

*Only when migration files change

## Required Secrets

### Staging
```
STAGING_DATABASE_URL=postgresql://...
```

### Production
```
PRODUCTION_DATABASE_URL=postgresql://...
```

### Optional
```
SENTRY_DSN=https://...
KUBECONFIG=base64-encoded-kubeconfig
```

## Migration Commands

### Via GitHub Actions
1. Go to **Actions** → **Database Migrations**
2. Click **Run workflow**
3. Select:
   - Environment: `staging` or `production`
   - Action: `up`, `down`, `status`, `redo`
   - Dry run: `true` to test first

### Via CLI
```bash
# Create migration
cd backend/api
npm run migrate:create add_new_column

# Check status
npm run migrate:status

# Apply migrations
npm run migrate:up

# Rollback migration
npm run migrate:down
```

## Deployment Commands

### Manual Deploy (Docker Compose)
```bash
# Pull latest images
docker-compose -f docker-compose.prod.yml pull

# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps
```

### Manual Deploy (Kubernetes)
```bash
# Update images
kubectl set image deployment/api \
  api=ghcr.io/OWNER/REPO/api:latest -n volume-bot

kubectl set image deployment/worker \
  worker=ghcr.io/OWNER/REPO/workers:latest -n volume-bot

# Rollout status
kubectl rollout status deployment/api -n volume-bot
kubectl rollout status deployment/worker -n volume-bot
```

## Troubleshooting

### Workflow Failed?
```bash
# View logs
gh run view <run-id> --log

# Re-run failed jobs
gh run rerun <run-id> --failed

# Re-run entire workflow
gh run rerun <run-id>
```

### Tests Failing in CI but Pass Locally?
1. Check service containers are running (PostgreSQL, Redis)
2. Verify environment variables match CI
3. Check for timezone/locale differences
4. Run tests with CI environment variables locally:
   ```bash
   NODE_ENV=test DATABASE_URL=postgresql://test:test@localhost:5432/test_db npm run test
   ```

### Docker Build Failed?
1. Test build locally: `docker build -t test ./backend/api`
2. Check Dockerfile syntax
3. Verify base image exists
4. Check dependency installation
5. Review build logs for specific errors

### Migration Failed?
1. Check migration file syntax: `node -c migrations/xxx.js`
2. Test locally: `npm run migrate:up`
3. Use dry-run mode first
4. Check database connectivity
5. Review migration logs

### Can't Push Images to GHCR?
1. Check `packages: write` permission
2. Verify GITHUB_TOKEN is valid
3. Authenticate: `echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin`
4. Check organization settings allow GHCR

## Best Practices

✅ **DO:**
- Test locally before pushing
- Use dry-run for production migrations
- Review CI logs when workflows fail
- Keep workflow files simple and documented
- Use path filters to avoid unnecessary runs
- Enable caching for faster builds

❌ **DON'T:**
- Commit secrets to repository
- Skip tests to save time
- Ignore failing workflows
- Run production migrations without testing
- Disable concurrency controls
- Bypass code review process

## Quick Links

- [Workflows Directory](.github/workflows/)
- [Full CI/CD Documentation](.github/workflows/README.md)
- [Deployment Guide](../DEPLOYMENT.md)
- [GitHub Actions Dashboard](../../actions)
- [GitHub Container Registry](../../pkgs)

## Emergency Procedures

### Rollback Deployment
```bash
# Kubernetes
kubectl rollout undo deployment/api -n volume-bot
kubectl rollout undo deployment/worker -n volume-bot

# Docker Compose
docker-compose -f docker-compose.prod.yml down
docker pull ghcr.io/OWNER/REPO/api:<previous-tag>
docker-compose -f docker-compose.prod.yml up -d
```

### Rollback Migration
```bash
# Via GitHub Actions
Actions → Database Migrations → Run workflow
- Environment: production
- Action: down
- Dry run: false

# Via CLI
cd backend/api
npm run migrate:down
```

### Emergency Stop
```bash
# Stop all GitHub Actions workflows
gh workflow disable <workflow-id>

# Stop all containers
docker-compose -f docker-compose.prod.yml down

# Delete Kubernetes deployment
kubectl delete deployment api worker -n volume-bot
```

---

**Need help?** Check the [full documentation](.github/workflows/README.md) or contact DevOps team.
