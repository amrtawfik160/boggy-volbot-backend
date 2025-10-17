/**
 * Dashboard API Load Test
 * Tests dashboard endpoints under load
 *
 * Usage:
 *   k6 run backend/api/tests/load/dashboard-load.test.js
 *   k6 run -e SCENARIO=medium backend/api/tests/load/dashboard-load.test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, API_PREFIX, scenarios, thresholds, getAuthHeaders } from './config.js';

// Custom metrics
const dashboardErrorRate = new Rate('dashboard_errors');
const metricsLoadTime = new Trend('metrics_load_time');
const activityLoadTime = new Trend('activity_load_time');

export const options = {
  stages: scenarios[__ENV.SCENARIO || 'light'].stages,
  thresholds: {
    ...thresholds,
    dashboard_errors: ['rate<0.05'],
    metrics_load_time: ['p(95)<500'],
    activity_load_time: ['p(95)<800'],
  },
};

export function setup() {
  console.log('Starting dashboard load test...');
  return { token: __ENV.AUTH_TOKEN };
}

export default function(data) {
  const headers = getAuthHeaders(data.token);

  // Test 1: Get dashboard metrics
  const metricsResponse = http.get(`${BASE_URL}${API_PREFIX}/dashboard/metrics`, { headers });

  const metricsCheck = check(metricsResponse, {
    'metrics status is 200': (r) => r.status === 200,
    'metrics response time < 500ms': (r) => r.timings.duration < 500,
    'metrics returns valid data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body !== null;
      } catch (e) {
        return false;
      }
    },
  });

  metricsLoadTime.add(metricsResponse.timings.duration);
  dashboardErrorRate.add(!metricsCheck);

  sleep(0.5);

  // Test 2: Get recent activity
  const activityResponse = http.get(`${BASE_URL}${API_PREFIX}/dashboard/activity?limit=20`, { headers });

  const activityCheck = check(activityResponse, {
    'activity status is 200': (r) => r.status === 200,
    'activity response time < 800ms': (r) => r.timings.duration < 800,
    'activity returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body);
      } catch (e) {
        return false;
      }
    },
  });

  activityLoadTime.add(activityResponse.timings.duration);
  dashboardErrorRate.add(!activityCheck);

  sleep(1);
}

export function teardown(data) {
  console.log('Dashboard load test completed');
}
