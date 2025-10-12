/**
 * Health Check Load Test
 * Tests the health endpoint under extreme load
 *
 * Usage:
 *   k6 run backend/api/tests/load/health-check-load.test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { BASE_URL } from './config.js';

const healthErrorRate = new Rate('health_errors');

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 200 },
    { duration: '1m', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(99)<100'], // 99% under 100ms
    http_req_failed: ['rate<0.01'],   // Less than 1% failures
    health_errors: ['rate<0.01'],
  },
};

export function setup() {
  console.log('Starting health check load test...');
  console.log('This test hammers the health endpoint with high load');
}

export default function() {
  const response = http.get(`${BASE_URL}/health`);

  const passed = check(response, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 50ms': (r) => r.timings.duration < 50,
    'health check returns ok': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'ok' || body.healthy === true;
      } catch (e) {
        return r.body.includes('ok') || r.body.includes('healthy');
      }
    },
  });

  healthErrorRate.add(!passed);

  // Minimal sleep - we want to stress test this endpoint
  sleep(0.1);
}

export function teardown() {
  console.log('Health check load test completed');
}
