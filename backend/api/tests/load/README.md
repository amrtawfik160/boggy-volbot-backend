# Load Testing with k6

This directory contains comprehensive load tests for the Solana Volume Bot API using [k6](https://k6.io/).

## Prerequisites

1. **Install k6**
   ```bash
   brew install k6  # macOS
   # or visit https://k6.io/docs/getting-started/installation/
   ```

2. **Start the API server**
   ```bash
   cd backend/api
   npm run dev
   ```

3. **Set up test environment**
   Create a `.env.test` file or export environment variables:
   ```bash
   export AUTH_TOKEN="your-jwt-token-here"
   export API_URL="http://localhost:3001"
   ```

## Test Files

### Individual Endpoint Tests

- **`auth-load.test.js`** - Authentication endpoints (`/me`)
- **`dashboard-load.test.js`** - Dashboard metrics and activity
- **`campaigns-load.test.js`** - Campaign CRUD and lifecycle operations
- **`wallets-tokens-load.test.js`** - Wallets and tokens management
- **`settings-load.test.js`** - User settings endpoints
- **`health-check-load.test.js`** - Health check endpoint under extreme load

### Comprehensive Tests

- **`mixed-scenario-load.test.js`** - Realistic user workflows combining multiple endpoints

### Configuration

- **`config.js`** - Shared configuration and helper functions

## Running Tests

### Quick Start

Run a basic load test with light load:
```bash
k6 run backend/api/tests/load/auth-load.test.js
```

### Run with Different Scenarios

Each test supports multiple load scenarios via the `SCENARIO` environment variable:

- **`light`** - 5 concurrent users (default for most tests)
- **`medium`** - 20 concurrent users
- **`heavy`** - 50-100 concurrent users with spike
- **`spike`** - Sudden surge to 100 users

```bash
# Light load
k6 run -e SCENARIO=light backend/api/tests/load/campaigns-load.test.js

# Medium load
k6 run -e SCENARIO=medium backend/api/tests/load/dashboard-load.test.js

# Heavy load with authentication
k6 run -e SCENARIO=heavy -e AUTH_TOKEN="your-token" backend/api/tests/load/mixed-scenario-load.test.js

# Spike test
k6 run -e SCENARIO=spike backend/api/tests/load/campaigns-load.test.js
```

### Running All Tests

Use the provided shell script to run all tests sequentially:
```bash
chmod +x backend/api/tests/load/run-all-tests.sh
./backend/api/tests/load/run-all-tests.sh
```

### Generate HTML Reports

k6 can output results in various formats:

```bash
# JSON output
k6 run --out json=results.json backend/api/tests/load/auth-load.test.js

# CSV output
k6 run --out csv=results.csv backend/api/tests/load/dashboard-load.test.js

# InfluxDB (for visualization with Grafana)
k6 run --out influxdb=http://localhost:8086/k6 backend/api/tests/load/mixed-scenario-load.test.js
```

## Understanding Results

### Key Metrics

k6 provides comprehensive metrics including:

- **http_req_duration** - Request duration (p95, p99)
- **http_req_failed** - Failed request rate
- **http_reqs** - Total HTTP requests and requests per second
- **iteration_duration** - Time to complete one iteration

### Custom Metrics

Each test file defines custom metrics:

- **Error rates** - Specific to each endpoint group
- **Load times** - Detailed timing for different operations
- **Counters** - Track specific events (e.g., API calls per workflow)

### Performance Thresholds

Tests are configured with these default thresholds:

- 95% of requests complete under 500ms
- 99% of requests complete under 1 second
- Less than 5% request failures
- At least 10 requests per second

Tests **FAIL** if thresholds are not met.

### Example Output

```
scenarios: (100.00%) 1 scenario, 20 max VUs, 5m30s max duration (incl. graceful stop):
           * default: Up to 20 looping VUs for 5m0s over 3 stages (gracefulRampDown: 30s)

     ✓ campaigns list status is 200
     ✓ campaign detail status is 200

     campaign_detail_load_time...: avg=156.32ms min=89.12ms  med=142.51ms max=387.44ms p(90)=201.23ms p(95)=245.67ms
     campaign_errors.............: 0.00%   ✓ 0        ✗ 1243
     campaign_list_load_time.....: avg=243.45ms min=112.34ms med=231.67ms max=542.12ms p(90)=345.23ms p(95)=412.34ms
     http_req_duration...........: avg=199.43ms min=98.23ms  med=187.32ms max=542.12ms p(90)=289.34ms p(95)=356.78ms
     http_req_failed.............: 0.00%   ✓ 0        ✗ 2486
     http_reqs...................: 2486    8.286733/s

     ✓ All thresholds passed
```

## Test Scenarios Explained

### Light (Default)
- **Duration**: 2 minutes
- **Users**: 5 concurrent
- **Use Case**: Development testing, quick validation

### Medium
- **Duration**: 5 minutes
- **Users**: 20 concurrent
- **Use Case**: Production-like load, regular capacity testing

### Heavy
- **Duration**: 14 minutes
- **Users**: 50-100 concurrent with spikes
- **Use Case**: Stress testing, capacity planning

### Spike
- **Duration**: 3 minutes
- **Users**: 10 → 100 → 10 (sudden surge)
- **Use Case**: Testing system behavior during traffic spikes

## Authentication

Most endpoints require authentication. Set the `AUTH_TOKEN` environment variable:

```bash
# Option 1: Export as environment variable
export AUTH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Option 2: Pass directly to k6
k6 run -e AUTH_TOKEN="your-token" backend/api/tests/load/campaigns-load.test.js

# Option 3: Use .env.test file (recommended)
# Create .env.test and load with:
source .env.test && k6 run backend/api/tests/load/campaigns-load.test.js
```

## Tips for Best Results

1. **Run tests against a staging environment** - Don't load test production!

2. **Start with light scenarios** - Ensure tests pass before increasing load

3. **Monitor server resources** - Use tools like htop, Docker stats, or cloud monitoring

4. **Run multiple test iterations** - Results can vary; run 3-5 times and average

5. **Test with realistic data** - Ensure test database has representative data

6. **Warm up the server** - Run a quick test first to warm up caches

7. **Check for rate limits** - Adjust scenarios if hitting rate limits

8. **Review logs** - Check server logs for errors during tests

## Troubleshooting

### High Error Rates

- Check server logs for exceptions
- Verify authentication token is valid
- Ensure database connections are healthy
- Check if Redis/queue services are running

### Slow Response Times

- Monitor server CPU/memory usage
- Check database query performance
- Review Redis connection performance
- Consider scaling infrastructure

### Connection Refused

- Verify API server is running
- Check API_URL environment variable
- Ensure firewall allows connections

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Load Tests

on:
  schedule:
    - cron: '0 0 * * 0' # Weekly
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: grafana/setup-k6-action@v1
      - name: Run load tests
        env:
          AUTH_TOKEN: ${{ secrets.TEST_AUTH_TOKEN }}
          API_URL: ${{ secrets.STAGING_API_URL }}
        run: |
          k6 run -e SCENARIO=medium backend/api/tests/load/mixed-scenario-load.test.js
```

## Further Reading

- [k6 Documentation](https://k6.io/docs/)
- [Load Testing Best Practices](https://k6.io/docs/testing-guides/)
- [k6 Metrics Reference](https://k6.io/docs/using-k6/metrics/)
