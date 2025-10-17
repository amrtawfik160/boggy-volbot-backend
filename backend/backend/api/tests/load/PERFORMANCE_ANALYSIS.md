# Performance Analysis & Load Testing Guide

## Overview

This document provides a comprehensive analysis of the load testing infrastructure implemented for the Solana Volume Bot API. The tests are designed to identify performance bottlenecks, validate system stability under load, and provide actionable insights for optimization.

## Test Coverage

### 7 Comprehensive Test Suites

1. **Health Check Load Test** (`health-check-load.test.js`)
   - Purpose: Stress test the health endpoint with extreme load
   - Load: 50 → 200 concurrent users
   - Target: <50ms response time, <1% failure rate

2. **Authentication Load Test** (`auth-load.test.js`)
   - Purpose: Test authentication and user profile endpoints
   - Endpoints: `/v1/me`, `/v1/me/profile`
   - Focus: Auth token validation, session management

3. **Dashboard Load Test** (`dashboard-load.test.js`)
   - Purpose: Test dashboard data aggregation
   - Endpoints: `/v1/dashboard/metrics`, `/v1/dashboard/activity`
   - Focus: Data aggregation, query performance

4. **Campaigns Load Test** (`campaigns-load.test.js`)
   - Purpose: Test campaign CRUD operations and lifecycle
   - Endpoints: All `/v1/campaigns/*` endpoints
   - Focus: Database operations, queue interactions

5. **Wallets & Tokens Load Test** (`wallets-tokens-load.test.js`)
   - Purpose: Test wallet and token management
   - Endpoints: `/v1/wallets/*`, `/v1/tokens/*`
   - Focus: Blockchain data fetching, metadata retrieval

6. **Settings Load Test** (`settings-load.test.js`)
   - Purpose: Test configuration management
   - Endpoints: `/v1/settings/*`
   - Focus: Fast read operations, caching

7. **Mixed Scenario Load Test** (`mixed-scenario-load.test.js`)
   - Purpose: Simulate realistic user workflows
   - Coverage: 30% dashboard, 40% campaigns, 30% wallets/tokens
   - Focus: Real-world usage patterns

## Load Scenarios

### Light Load (Development Testing)
```javascript
Stages:
  - 30s ramp to 5 users
  - 1m hold at 5 users
  - 30s ramp down
Duration: 2 minutes
Use Case: Quick validation, development testing
```

### Medium Load (Production Simulation)
```javascript
Stages:
  - 1m ramp to 20 users
  - 3m hold at 20 users
  - 1m ramp down
Duration: 5 minutes
Use Case: Production-like load, capacity testing
```

### Heavy Load (Stress Testing)
```javascript
Stages:
  - 2m ramp to 50 users
  - 5m hold at 50 users
  - 2m spike to 100 users
  - 3m hold at 50 users
  - 2m ramp down
Duration: 14 minutes
Use Case: Stress testing, capacity planning
```

### Spike Test (Traffic Surge)
```javascript
Stages:
  - 10s at 10 users
  - 30s spike to 100 users
  - 1m hold at 100 users
  - 30s drop to 10 users
  - 30s ramp down
Duration: 3 minutes
Use Case: Sudden traffic surge simulation
```

## Performance Thresholds

### Global Thresholds (All Tests)

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| `http_req_duration` p95 | <500ms | 95% of requests complete within 500ms |
| `http_req_duration` p99 | <1000ms | 99% of requests complete within 1 second |
| `http_req_failed` | <5% | Less than 5% request failures |
| `http_reqs` rate | >10/s | Minimum throughput of 10 req/s |
| `iteration_duration` p95 | <5000ms | User workflows complete within 5s |

### Endpoint-Specific Thresholds

| Endpoint | p95 Target | p99 Target | Notes |
|----------|-----------|-----------|-------|
| `/health` | <50ms | <100ms | Should be extremely fast |
| `/v1/me` | <200ms | <300ms | Simple auth check |
| `/v1/settings` | <300ms | <500ms | Cached configuration |
| `/v1/dashboard/metrics` | <500ms | <800ms | Data aggregation |
| `/v1/campaigns` | <600ms | <1000ms | Database queries |
| `/v1/campaigns/:id/status` | <700ms | <1200ms | Queue stats + DB |
| `/v1/tokens/:id/pools` | <800ms | <1500ms | Blockchain data |

## Expected Performance Characteristics

### Optimal Performance (Target State)

```
Light Load (5 users):
  ✓ Avg response time: 100-200ms
  ✓ p95 response time: 200-400ms
  ✓ Error rate: <1%
  ✓ Throughput: 15-25 req/s

Medium Load (20 users):
  ✓ Avg response time: 150-300ms
  ✓ p95 response time: 400-600ms
  ✓ Error rate: <2%
  ✓ Throughput: 50-80 req/s

Heavy Load (50-100 users):
  ✓ Avg response time: 300-500ms
  ✓ p95 response time: 600-1000ms
  ✓ Error rate: <5%
  ✓ Throughput: 80-150 req/s
```

## Potential Bottlenecks & Solutions

### 1. Database Connection Pool Exhaustion

**Symptoms:**
- Increased response times under load
- "Too many connections" errors
- High database CPU usage

**Detection:**
```javascript
http_req_duration increases significantly
Database connection errors in logs
```

**Solutions:**
- Increase PostgreSQL `max_connections`
- Optimize Supabase connection pool size
- Implement connection pooling with PgBouncer
- Add read replicas for read-heavy queries

### 2. Redis Queue Bottleneck

**Symptoms:**
- Campaign operations slow down
- Queue depth increases continuously
- Workers can't keep up with job rate

**Detection:**
```javascript
/campaigns/:id/status shows high queue counts
Job processing lag increases
```

**Solutions:**
- Scale worker instances horizontally
- Optimize worker job processing logic
- Implement job prioritization
- Add Redis cluster for higher throughput

### 3. Supabase API Rate Limits

**Symptoms:**
- 429 (Too Many Requests) responses
- Requests fail intermittently under heavy load

**Detection:**
```javascript
http_req_failed rate increases
429 status codes in responses
```

**Solutions:**
- Implement request batching
- Add caching layer (Redis)
- Upgrade Supabase plan
- Implement exponential backoff retry logic

### 4. Blockchain RPC Rate Limits

**Symptoms:**
- Token/pool data fetching fails
- Metadata retrieval times out
- Solana RPC errors

**Detection:**
```javascript
/tokens/* endpoints show high failure rate
Solana RPC timeout errors
```

**Solutions:**
- Implement RPC endpoint rotation
- Cache blockchain data (tokens, pools)
- Use multiple RPC providers
- Implement request queuing/throttling

### 5. Memory Leaks

**Symptoms:**
- Response times gradually increase over time
- Server memory usage continuously grows
- Eventual out-of-memory crashes

**Detection:**
```javascript
Monitor server memory over extended test runs
Compare memory at start vs end of heavy load test
```

**Solutions:**
- Profile application with heap dumps
- Fix object retention issues
- Implement proper cleanup in workers
- Monitor with tools like clinic.js

### 6. CPU-Intensive Operations

**Symptoms:**
- High server CPU usage
- Response times increase proportionally with load
- Worker processes become slow

**Detection:**
```javascript
Server CPU at 100%
Response times scale linearly with users
```

**Solutions:**
- Optimize encryption/decryption operations
- Move heavy computations to background jobs
- Implement result caching
- Scale vertically (more CPU cores)

## Monitoring & Metrics

### Key Metrics to Track

1. **Response Time Metrics**
   - Average (mean)
   - Median (p50)
   - 95th percentile (p95)
   - 99th percentile (p99)
   - Maximum

2. **Throughput Metrics**
   - Requests per second
   - Successful requests
   - Failed requests
   - Request rate over time

3. **Error Metrics**
   - Error rate (%)
   - Error types (4xx vs 5xx)
   - Timeout errors
   - Connection errors

4. **System Metrics**
   - Server CPU usage
   - Memory usage
   - Database connections
   - Redis queue depth

### Continuous Monitoring Setup

#### 1. Application Performance Monitoring (APM)

Recommended tools:
- **New Relic** - Comprehensive APM
- **DataDog** - Full-stack monitoring
- **Sentry** - Error tracking
- **Prometheus + Grafana** - Open-source solution

#### 2. Load Testing in CI/CD

```yaml
# .github/workflows/load-test.yml
name: Weekly Load Test

on:
  schedule:
    - cron: '0 2 * * 0'  # Sunday 2 AM
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: grafana/setup-k6-action@v1

      - name: Run light load test
        run: |
          k6 run -e SCENARIO=light \
            -e AUTH_TOKEN=${{ secrets.TEST_AUTH_TOKEN }} \
            backend/api/tests/load/mixed-scenario-load.test.js

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: load-test-results/
```

## Optimization Recommendations

### Immediate Wins (Low Effort, High Impact)

1. **Enable Response Caching**
   - Cache dashboard metrics (5-10 second TTL)
   - Cache token metadata (1-5 minute TTL)
   - Cache user settings (1 minute TTL)

2. **Database Query Optimization**
   - Add indexes on frequently queried columns
   - Use `SELECT` specific columns (not `SELECT *`)
   - Implement pagination for list endpoints

3. **Connection Pooling**
   - Configure optimal pool size (CPU cores * 2 + disk count)
   - Set appropriate connection timeouts
   - Monitor pool utilization

### Medium-Term Improvements

1. **Implement Redis Caching**
   ```javascript
   // Cache frequently accessed data
   - User profiles (1 hour TTL)
   - Campaign configurations (5 min TTL)
   - Token metadata (10 min TTL)
   - Dashboard metrics (30 sec TTL)
   ```

2. **Optimize Worker Processing**
   - Batch database writes
   - Implement job prioritization
   - Add worker autoscaling based on queue depth

3. **Add Rate Limiting**
   - Per-user rate limits
   - Per-endpoint rate limits
   - Graceful degradation under extreme load

### Long-Term Scalability

1. **Horizontal Scaling**
   - Multiple API server instances
   - Load balancer (Nginx/HAProxy)
   - Stateless application design

2. **Database Optimization**
   - Read replicas for read-heavy queries
   - Database sharding if needed
   - Move historical data to separate tables

3. **Microservices Architecture**
   - Separate campaign management service
   - Dedicated worker service
   - Independent wallet service

## Running the Tests

### Prerequisites

1. Install k6: `brew install k6`
2. Start API server: `npm run dev`
3. Set auth token: `export AUTH_TOKEN="your-jwt-token"`

### Quick Test (Light Load)

```bash
k6 run backend/api/tests/load/health-check-load.test.js
```

### Full Test Suite

```bash
./backend/api/tests/load/run-all-tests.sh medium
```

### Individual Tests

```bash
# Dashboard performance
k6 run -e SCENARIO=medium backend/api/tests/load/dashboard-load.test.js

# Campaign operations under heavy load
k6 run -e SCENARIO=heavy backend/api/tests/load/campaigns-load.test.js

# Realistic user workflows
k6 run -e SCENARIO=spike backend/api/tests/load/mixed-scenario-load.test.js
```

## Interpreting Results

### Green (Healthy)
```
✓ All checks pass
✓ http_req_duration p95 < threshold
✓ http_req_failed < 5%
✓ No timeout errors
```
**Action:** System is performing well, continue monitoring

### Yellow (Warning)
```
⚠ Some checks fail occasionally
⚠ p95 approaching thresholds
⚠ Error rate 2-5%
⚠ Some timeout errors
```
**Action:** Investigate specific endpoints, consider optimizations

### Red (Critical)
```
✗ Many checks fail
✗ p95 exceeds thresholds significantly
✗ Error rate > 5%
✗ Frequent timeouts or connection errors
```
**Action:** Immediate investigation required, consider rolling back recent changes

## Next Steps

1. **Fix API Build Issues** - Resolve TypeScript compilation errors
2. **Run Baseline Tests** - Establish performance baseline with light load
3. **Identify Bottlenecks** - Run medium/heavy tests and analyze results
4. **Implement Optimizations** - Apply recommendations based on findings
5. **Continuous Monitoring** - Set up regular load tests in CI/CD
6. **Document Benchmarks** - Record performance metrics for comparison

## Conclusion

The comprehensive load testing infrastructure is now in place with:
- ✅ 7 test suites covering all API endpoints
- ✅ 4 load scenarios (light, medium, heavy, spike)
- ✅ Custom metrics and performance thresholds
- ✅ Automated test runner
- ✅ Detailed documentation

Once the API build issues are resolved, these tests will provide valuable insights into system performance and help identify optimization opportunities.
