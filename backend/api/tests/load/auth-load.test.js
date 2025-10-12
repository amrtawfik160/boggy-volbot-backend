/**
 * Authentication Load Test
 * Tests the /v1/me endpoint under various load conditions
 *
 * Usage:
 *   k6 run backend/api/tests/load/auth-load.test.js
 *   k6 run -e SCENARIO=heavy backend/api/tests/load/auth-load.test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { BASE_URL, API_PREFIX, scenarios, thresholds, getAuthHeaders } from './config.js';

// Custom metrics
const authErrorRate = new Rate('auth_errors');
const unauthorizedRate = new Rate('unauthorized_requests');

// Test options
export const options = {
  stages: scenarios[__ENV.SCENARIO || 'light'].stages,
  thresholds: {
    ...thresholds,
    auth_errors: ['rate<0.01'],
    unauthorized_requests: ['rate<0.05'],
  },
};

export function setup() {
  console.log('Starting authentication load test...');
  console.log(`Target: ${BASE_URL}${API_PREFIX}`);
  console.log(`Scenario: ${__ENV.SCENARIO || 'light'}`);

  // Note: In a real test, you would authenticate here and return the token
  // For now, we'll assume the token is provided via AUTH_TOKEN env variable
  return { token: __ENV.AUTH_TOKEN };
}

export default function(data) {
  const headers = getAuthHeaders(data.token);

  // Test 1: Get current user info
  const meResponse = http.get(`${BASE_URL}${API_PREFIX}/me`, { headers });

  const meCheck = check(meResponse, {
    'me endpoint status is 200': (r) => r.status === 200,
    'me endpoint response time < 200ms': (r) => r.timings.duration < 200,
    'me endpoint returns valid JSON': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body !== null;
      } catch (e) {
        return false;
      }
    },
  });

  authErrorRate.add(!meCheck);
  unauthorizedRate.add(meResponse.status === 401);

  // Test 2: Get user info with profile (if endpoint exists)
  const meProfileResponse = http.get(`${BASE_URL}${API_PREFIX}/me/profile`, { headers });

  check(meProfileResponse, {
    'me/profile endpoint responds': (r) => r.status === 200 || r.status === 404,
  });

  // Simulate user think time
  sleep(1);
}

export function teardown(data) {
  console.log('Authentication load test completed');
}
