/**
 * Wallets and Tokens API Load Test
 * Tests wallets and tokens endpoints under load
 *
 * Usage:
 *   k6 run backend/api/tests/load/wallets-tokens-load.test.js
 *   k6 run -e SCENARIO=medium backend/api/tests/load/wallets-tokens-load.test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { BASE_URL, API_PREFIX, scenarios, thresholds, getAuthHeaders } from './config.js';

// Custom metrics
const walletsErrorRate = new Rate('wallets_errors');
const tokensErrorRate = new Rate('tokens_errors');
const walletsLoadTime = new Trend('wallets_load_time');
const tokensLoadTime = new Trend('tokens_load_time');

export const options = {
  stages: scenarios[__ENV.SCENARIO || 'light'].stages,
  thresholds: {
    ...thresholds,
    wallets_errors: ['rate<0.05'],
    tokens_errors: ['rate<0.05'],
    wallets_load_time: ['p(95)<500'],
    tokens_load_time: ['p(95)<600'],
  },
};

export function setup() {
  console.log('Starting wallets and tokens load test...');
  return { token: __ENV.AUTH_TOKEN };
}

export default function(data) {
  const headers = getAuthHeaders(data.token);

  // Test 1: List all wallets
  const walletsResponse = http.get(`${BASE_URL}${API_PREFIX}/wallets`, { headers });

  const walletsCheck = check(walletsResponse, {
    'wallets list status is 200': (r) => r.status === 200,
    'wallets list response time < 500ms': (r) => r.timings.duration < 500,
    'wallets list returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body);
      } catch (e) {
        return false;
      }
    },
  });

  walletsLoadTime.add(walletsResponse.timings.duration);
  walletsErrorRate.add(!walletsCheck);

  sleep(0.5);

  // Test 2: Get wallet details (if wallets exist)
  if (walletsResponse.status === 200) {
    try {
      const wallets = JSON.parse(walletsResponse.body);
      if (wallets.length > 0) {
        const walletId = wallets[0].id;

        const walletDetailResponse = http.get(`${BASE_URL}${API_PREFIX}/wallets/${walletId}`, { headers });

        check(walletDetailResponse, {
          'wallet detail status is 200': (r) => r.status === 200,
          'wallet detail has id': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.id !== undefined;
            } catch (e) {
              return false;
            }
          },
        });

        sleep(0.5);
      }
    } catch (e) {
      // Ignore parsing errors
    }
  }

  // Test 3: List all tokens
  const tokensResponse = http.get(`${BASE_URL}${API_PREFIX}/tokens`, { headers });

  const tokensCheck = check(tokensResponse, {
    'tokens list status is 200': (r) => r.status === 200,
    'tokens list response time < 600ms': (r) => r.timings.duration < 600,
    'tokens list returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body);
      } catch (e) {
        return false;
      }
    },
  });

  tokensLoadTime.add(tokensResponse.timings.duration);
  tokensErrorRate.add(!tokensCheck);

  sleep(0.5);

  // Test 4: Get token details (if tokens exist)
  if (tokensResponse.status === 200) {
    try {
      const tokens = JSON.parse(tokensResponse.body);
      if (tokens.length > 0) {
        const tokenId = tokens[0].id;

        const tokenDetailResponse = http.get(`${BASE_URL}${API_PREFIX}/tokens/${tokenId}`, { headers });

        check(tokenDetailResponse, {
          'token detail status is 200': (r) => r.status === 200,
          'token detail has address': (r) => {
            try {
              const body = JSON.parse(r.body);
              return body.address !== undefined;
            } catch (e) {
              return false;
            }
          },
        });

        sleep(0.5);

        // Test 5: Get token pools
        const poolsResponse = http.get(`${BASE_URL}${API_PREFIX}/tokens/${tokenId}/pools`, { headers });

        check(poolsResponse, {
          'token pools responds': (r) => r.status === 200 || r.status === 404,
        });
      }
    } catch (e) {
      // Ignore parsing errors
    }
  }

  sleep(1);
}

export function teardown(data) {
  console.log('Wallets and tokens load test completed');
}
