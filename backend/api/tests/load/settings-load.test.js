/**
 * Settings API Load Test
 * Tests settings endpoints under load
 *
 * Usage:
 *   k6 run backend/api/tests/load/settings-load.test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, API_PREFIX, scenarios, thresholds, getAuthHeaders } from './config.js';

// Custom metrics
const settingsErrorRate = new Rate('settings_errors');
const settingsLoadTime = new Trend('settings_load_time');

export const options = {
  stages: scenarios[__ENV.SCENARIO || 'light'].stages,
  thresholds: {
    ...thresholds,
    settings_errors: ['rate<0.05'],
    settings_load_time: ['p(95)<300'],
  },
};

export function setup() {
  console.log('Starting settings load test...');
  return { token: __ENV.AUTH_TOKEN };
}

export default function(data) {
  const headers = getAuthHeaders(data.token);

  // Test 1: Get user settings
  const getResponse = http.get(`${BASE_URL}${API_PREFIX}/settings`, { headers });

  const getCheck = check(getResponse, {
    'settings get status is 200': (r) => r.status === 200,
    'settings get response time < 300ms': (r) => r.timings.duration < 300,
    'settings get returns valid data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body !== null;
      } catch (e) {
        return false;
      }
    },
  });

  settingsLoadTime.add(getResponse.timings.duration);
  settingsErrorRate.add(!getCheck);

  sleep(1);

  // Test 2: Get jito configuration
  const jitoResponse = http.get(`${BASE_URL}${API_PREFIX}/settings/jito`, { headers });

  check(jitoResponse, {
    'jito settings status is 200': (r) => r.status === 200,
    'jito settings has config': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body !== null;
      } catch (e) {
        return false;
      }
    },
  });

  sleep(1);

  // Test 3: Get encryption configuration
  const encryptionResponse = http.get(`${BASE_URL}${API_PREFIX}/settings/encryption`, { headers });

  check(encryptionResponse, {
    'encryption settings status is 200': (r) => r.status === 200,
  });

  sleep(1);
}

export function teardown(data) {
  console.log('Settings load test completed');
}
