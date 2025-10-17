/**
 * Campaigns API Load Test
 * Tests campaign CRUD operations and lifecycle endpoints under load
 *
 * Usage:
 *   k6 run backend/api/tests/load/campaigns-load.test.js
 *   k6 run -e SCENARIO=heavy backend/api/tests/load/campaigns-load.test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { BASE_URL, API_PREFIX, scenarios, thresholds, getAuthHeaders } from './config.js';

// Custom metrics
const campaignErrorRate = new Rate('campaign_errors');
const listLoadTime = new Trend('campaign_list_load_time');
const detailLoadTime = new Trend('campaign_detail_load_time');
const statusLoadTime = new Trend('campaign_status_load_time');
const totalRequests = new Counter('campaign_total_requests');

export const options = {
  stages: scenarios[__ENV.SCENARIO || 'medium'].stages,
  thresholds: {
    ...thresholds,
    campaign_errors: ['rate<0.05'],
    campaign_list_load_time: ['p(95)<600'],
    campaign_detail_load_time: ['p(95)<400'],
    campaign_status_load_time: ['p(95)<700'],
  },
};

export function setup() {
  console.log('Starting campaigns load test...');
  const token = __ENV.AUTH_TOKEN;

  // Get an existing campaign ID for testing
  const headers = getAuthHeaders(token);
  const campaignsResponse = http.get(`${BASE_URL}${API_PREFIX}/campaigns`, { headers });

  let testCampaignId = null;
  if (campaignsResponse.status === 200) {
    try {
      const campaigns = JSON.parse(campaignsResponse.body);
      if (campaigns.length > 0) {
        testCampaignId = campaigns[0].id;
        console.log(`Using campaign ID: ${testCampaignId} for testing`);
      }
    } catch (e) {
      console.error('Failed to parse campaigns:', e);
    }
  }

  return { token, campaignId: testCampaignId };
}

export default function(data) {
  const headers = getAuthHeaders(data.token);

  // Test 1: List all campaigns
  const listResponse = http.get(`${BASE_URL}${API_PREFIX}/campaigns`, { headers });

  const listCheck = check(listResponse, {
    'list campaigns status is 200': (r) => r.status === 200,
    'list campaigns response time < 600ms': (r) => r.timings.duration < 600,
    'list campaigns returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body);
      } catch (e) {
        return false;
      }
    },
  });

  listLoadTime.add(listResponse.timings.duration);
  campaignErrorRate.add(!listCheck);
  totalRequests.add(1);

  sleep(0.5);

  // Test 2: Get campaign details (if we have a campaign ID)
  if (data.campaignId) {
    const detailResponse = http.get(`${BASE_URL}${API_PREFIX}/campaigns/${data.campaignId}`, { headers });

    const detailCheck = check(detailResponse, {
      'campaign detail status is 200': (r) => r.status === 200,
      'campaign detail response time < 400ms': (r) => r.timings.duration < 400,
      'campaign detail has id': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.id !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    detailLoadTime.add(detailResponse.timings.duration);
    campaignErrorRate.add(!detailCheck);
    totalRequests.add(1);

    sleep(0.5);

    // Test 3: Get campaign status
    const statusResponse = http.get(`${BASE_URL}${API_PREFIX}/campaigns/${data.campaignId}/status`, { headers });

    const statusCheck = check(statusResponse, {
      'campaign status is 200': (r) => r.status === 200,
      'campaign status response time < 700ms': (r) => r.timings.duration < 700,
      'campaign status has campaign field': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.campaign !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    statusLoadTime.add(statusResponse.timings.duration);
    campaignErrorRate.add(!statusCheck);
    totalRequests.add(1);

    sleep(0.5);

    // Test 4: Get campaign runs
    const runsResponse = http.get(`${BASE_URL}${API_PREFIX}/campaigns/${data.campaignId}/runs`, { headers });

    check(runsResponse, {
      'campaign runs status is 200': (r) => r.status === 200,
      'campaign runs returns array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body);
        } catch (e) {
          return false;
        }
      },
    });

    totalRequests.add(1);

    sleep(0.5);

    // Test 5: Get campaign logs
    const logsResponse = http.get(`${BASE_URL}${API_PREFIX}/campaigns/${data.campaignId}/logs?limit=50`, { headers });

    check(logsResponse, {
      'campaign logs responds': (r) => r.status === 200 || r.status === 404,
    });

    totalRequests.add(1);
  }

  sleep(1);
}

export function teardown(data) {
  console.log('Campaigns load test completed');
}
