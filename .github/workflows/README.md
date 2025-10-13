# GitHub Actions CI/CD Workflows

This directory contains GitHub Actions workflows that automate testing, building, deploying, and managing database migrations for the Solana Volume Bot project.

## Table of Contents

- [Workflow Overview](#workflow-overview)
- [Workflows](#workflows)
- [Setup Requirements](#setup-requirements)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Workflow Overview

Our CI/CD pipeline consists of four main workflows:

| Workflow | Trigger | Purpose | Duration |
|----------|---------|---------|----------|
| **Lint and Type Check** | PRs to main/develop | Code quality checks | ~2-3 min |
| **Test** | PRs and pushes to main | Run automated tests | ~5-7 min |
| **Build and Deploy** | Pushes to main | Build Docker images and deploy | ~10-15 min |
| **Database Migrations** | Push to main or manual | Run database migrations | ~2-3 min |

## Workflows

### 1. Lint and Type Check (`lint-and-typecheck.yml`)

**Purpose:** Ensures code quality and type safety before merging PRs.

**Triggers:**
- Pull requests to `main` or `develop` branches
- Only when relevant files change (`frontend/**`, `backend/**`)

**Jobs:**
- `frontend-lint`: ESLint and Prettier checks for frontend
- `backend-api-lint`: ESLint, TypeScript, and Prettier checks for API
- `backend-workers-lint`: ESLint, TypeScript, and Prettier checks for workers

**Key Features:**
- Parallel execution for fast feedback
- Concurrency control to cancel duplicate runs
- Path filtering to run only when needed
- npm cache for faster dependency installation

**Usage:**
This workflow runs automatically on every PR. No manual intervention needed.

---

### 2. Test (`test.yml`)

**Purpose:** Runs automated unit and integration tests to ensure code correctness.

**Triggers:**
- Pull requests to `main` or `develop` branches
- Pushes to `main` branch
- Only when relevant files change (`frontend/**`, `backend/**`)

**Jobs:**
- `frontend-test`: Vitest tests for frontend
- `backend-api-test`: Vitest tests for API with PostgreSQL and Redis services
- `backend-workers-test`: Vitest tests for workers with PostgreSQL and Redis services
- `test-summary`: Aggregates results and fails if any test job fails

**Key Features:**
- Parallel test execution across components
- PostgreSQL 15 and Redis 7 service containers for integration tests
- Coverage reports uploaded as artifacts (7-day retention)
- Test summary job for easy result verification

**Usage:**
This workflow runs automatically on PRs and main pushes. No manual intervention needed.

**Viewing Coverage:**
1. Go to the Actions tab
2. Select the workflow run
3. Download coverage artifacts from the summary page

---

### 3. Build and Deploy (`build-and-deploy.yml`)

**Purpose:** Builds Docker images and deploys to staging/production environments.

**Triggers:**
- Pushes to `main` branch
- Only when relevant files change (`frontend/**`, `backend/**`, `k8s/**`, `docker-compose.prod.yml`)

**Jobs:**
- `build-frontend`: Build and push frontend Docker image
- `build-backend-api`: Build and push API Docker image
- `build-backend-workers`: Build and push workers Docker image
- `deploy-staging`: Deploy to staging environment (requires setup)
- `rollback`: Rollback on deployment failure

**Key Features:**
- Parallel Docker image builds for efficiency
- GitHub Container Registry (ghcr.io) for image storage
- Docker layer caching for faster builds
- Multiple image tags: branch name, commit SHA, latest
- Concurrency control prevents conflicting deployments
- Automatic rollback on failure

**Image Tags:**
- `ghcr.io/OWNER/REPO/frontend:main` - Latest main branch
- `ghcr.io/OWNER/REPO/frontend:main-abc123` - Specific commit
- `ghcr.io/OWNER/REPO/frontend:latest` - Latest on default branch

**Usage:**
This workflow runs automatically on pushes to main. Images are pushed to GitHub Container Registry.

**Manual Deployment:**
```bash
# Pull images
docker pull ghcr.io/OWNER/REPO/frontend:latest
docker pull ghcr.io/OWNER/REPO/api:latest
docker pull ghcr.io/OWNER/REPO/workers:latest

# Deploy using docker-compose
docker-compose -f docker-compose.prod.yml up -d

# Or deploy to Kubernetes
kubectl set image deployment/api api=ghcr.io/OWNER/REPO/api:latest -n volume-bot
kubectl set image deployment/worker worker=ghcr.io/OWNER/REPO/workers:latest -n volume-bot
```

**Automatic Deployment Setup:**
To enable automatic deployment to Kubernetes:
1. Uncomment the deployment steps in `deploy-staging` job
2. Configure Kubernetes credentials in GitHub secrets
3. Update image names and namespaces in the workflow

---

### 4. Database Migrations (`database-migrations.yml`)

**Purpose:** Automates database schema migrations with safety checks.

**Triggers:**
- **Automatic:** Pushes to `main` when migration files change (`backend/api/migrations/**`)
- **Manual:** Workflow dispatch from GitHub Actions UI

**Jobs:**
- `validate-migrations`: Validates migration file syntax
- `run-migrations-staging`: Runs migrations on staging database
- `run-migrations-production`: Runs migrations on production database (manual only)
- `rollback-guide`: Provides rollback instructions on failure

**Key Features:**
- Migration validation before execution
- Automatic staging migrations on push
- Manual production migrations for safety
- Support for multiple actions: `up`, `down`, `status`, `redo`
- Dry-run mode for testing without applying changes
- Concurrency control prevents overlapping migrations
- Rollback instructions on failure

**Running Migrations Manually:**

1. Go to **Actions** → **Database Migrations** → **Run workflow**
2. Select options:
   - **Environment:** `staging` or `production`
   - **Migration action:** `up`, `down`, `status`, or `redo`
   - **Dry run:** Check to test without applying changes

**Migration Actions:**
- `up`: Apply pending migrations (default)
- `down`: Rollback the most recent migration
- `status`: Check current migration status
- `redo`: Rollback and reapply the most recent migration

**Best Practices:**
- Always test migrations on staging first
- Use dry-run mode to preview changes
- Ensure database backups exist before production migrations
- Monitor application after migrations
- Be ready to rollback if issues occur

---

## Setup Requirements

### Required Secrets

Configure these secrets in **Settings** → **Secrets and variables** → **Actions**:

#### Staging Environment
- `STAGING_DATABASE_URL`: PostgreSQL connection string for staging database

#### Production Environment
- `PRODUCTION_DATABASE_URL`: PostgreSQL connection string for production database

#### Optional (for automatic deployments)
- `KUBECONFIG`: Kubernetes cluster configuration
- `DEPLOY_SSH_KEY`: SSH key for deployment server access
- `SENTRY_DSN`: Sentry error tracking DSN

### Required Permissions

The workflows require these permissions (already configured):
- `contents: read` - Read repository code
- `packages: write` - Push to GitHub Container Registry
- `id-token: write` - OIDC authentication (for cloud deployments)

### GitHub Container Registry Setup

1. Enable GitHub Container Registry:
   - Go to **Settings** → **Packages**
   - Enable "Improved container support"

2. Pull images from GHCR:
   ```bash
   # Authenticate with GitHub
   echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

   # Pull images
   docker pull ghcr.io/OWNER/REPO/frontend:latest
   ```

---

## Best Practices

### Workflow Organization

1. **Separation of Concerns**
   - Each workflow has a single, clear purpose
   - Lint/test workflows are fast and run on every PR
   - Build/deploy workflows run only on main branch
   - Migration workflows have both automatic and manual triggers

2. **Concurrency Control**
   - All workflows use concurrency groups
   - PR workflows cancel previous runs for the same PR
   - Deployment workflows don't cancel (prevent incomplete deployments)
   - Migration workflows prevent overlapping executions

3. **Path Filtering**
   - Workflows only run when relevant files change
   - Reduces unnecessary workflow executions
   - Saves CI/CD minutes and provides faster feedback

4. **Caching Strategy**
   - npm dependencies cached using `actions/setup-node`
   - Docker layers cached using GitHub Actions cache
   - Reduces build times by 50-70%

### Security Best Practices

1. **Secrets Management**
   - Never hardcode secrets in workflows
   - Use GitHub Secrets for sensitive data
   - Use environment-specific secrets (staging vs production)
   - Rotate secrets regularly

2. **Least Privilege**
   - Workflows request only necessary permissions
   - Use environment protection rules for production
   - Require manual approval for production deployments

3. **Image Security**
   - Scan Docker images for vulnerabilities
   - Keep base images updated
   - Use multi-stage builds to reduce image size
   - Don't include secrets in images

### Performance Optimization

1. **Parallel Execution**
   - Run independent jobs in parallel
   - Frontend, API, and workers build simultaneously
   - Tests run in parallel across components

2. **Early Failures**
   - Lint and type-check before tests
   - Validate migrations before running
   - Fail fast to save time and resources

3. **Incremental Builds**
   - Use Docker layer caching
   - Cache npm dependencies
   - Only rebuild what changed

### Monitoring and Maintenance

1. **Workflow Monitoring**
   - Check workflow status regularly
   - Set up notifications for failures
   - Review workflow execution times
   - Monitor cache hit rates

2. **Regular Updates**
   - Update action versions quarterly
   - Update Node.js version as needed
   - Update base Docker images
   - Review and optimize slow workflows

3. **Documentation**
   - Keep this README updated
   - Document custom workflows
   - Add comments to complex workflow steps
   - Share knowledge with team

---

## Troubleshooting

### Common Issues

#### 1. Workflow Not Triggering

**Problem:** Workflow doesn't run on PR or push

**Solutions:**
- Check path filters in `on.push.paths` or `on.pull_request.paths`
- Ensure branch name matches trigger conditions
- Verify workflow file syntax with `yamllint`
- Check if concurrency settings are blocking execution

#### 2. Docker Build Failures

**Problem:** Docker build fails with "build failed" error

**Solutions:**
- Check Dockerfile syntax
- Verify base image is accessible
- Check if dependencies can be installed
- Review build logs for specific errors
- Test build locally: `docker build -t test ./backend/api`

#### 3. Test Failures

**Problem:** Tests pass locally but fail in CI

**Solutions:**
- Check service container connectivity (PostgreSQL, Redis)
- Verify environment variables are set
- Check for timezone differences
- Review test logs for specific failures
- Test with service containers locally using docker-compose

#### 4. Migration Failures

**Problem:** Database migrations fail in CI

**Solutions:**
- Verify `DATABASE_URL` secret is set correctly
- Test migration locally first
- Check migration file syntax
- Ensure migration is idempotent
- Review migration logs for specific errors
- Use dry-run mode to preview changes

#### 5. Permission Denied (GHCR)

**Problem:** Cannot push images to GitHub Container Registry

**Solutions:**
- Check `packages: write` permission is granted
- Verify GITHUB_TOKEN is valid
- Ensure repository visibility is correct
- Check organization settings allow GHCR

#### 6. Slow Workflow Execution

**Problem:** Workflows take too long to complete

**Solutions:**
- Enable and verify caching (npm, Docker layers)
- Run jobs in parallel where possible
- Use path filtering to skip unnecessary runs
- Consider using self-hosted runners for faster builds
- Review and optimize Dockerfile for faster builds

### Getting Help

1. **Check Workflow Logs**
   - Go to Actions tab → Select workflow run
   - Expand failed job and step
   - Review detailed logs and error messages

2. **Validate Workflow Syntax**
   ```bash
   # Install yamllint
   npm install -g yaml-lint

   # Validate workflow files
   yamllint .github/workflows/*.yml
   ```

3. **Test Locally**
   ```bash
   # Install act (local GitHub Actions runner)
   brew install act  # macOS

   # Run workflow locally
   act push -W .github/workflows/test.yml
   ```

4. **Contact Team**
   - Check internal documentation
   - Ask in team Slack/Discord
   - Review GitHub Actions documentation
   - Open issue in repository for persistent problems

---

## Workflow Maintenance Checklist

Use this checklist when maintaining workflows:

- [ ] Review workflow execution times monthly
- [ ] Update action versions quarterly
- [ ] Check cache hit rates and optimize
- [ ] Review and remove unnecessary steps
- [ ] Update documentation when workflows change
- [ ] Test workflows after major changes
- [ ] Monitor CI/CD costs and optimize
- [ ] Review security best practices
- [ ] Update Node.js and Docker base images
- [ ] Validate all workflows pass on main branch

---

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Build Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [node-pg-migrate Documentation](https://salsita.github.io/node-pg-migrate/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)

---

## Support

For issues or questions about these workflows:
1. Review this documentation
2. Check workflow logs in Actions tab
3. Test locally when possible
4. Contact DevOps team for assistance
5. Open issue in repository for bugs or improvements
