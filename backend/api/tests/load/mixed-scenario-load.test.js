/**
 * Mixed Scenario Load Test
 * Simulates realistic user behavior with mixed API calls
 *
 * This test simulates typical user workflows:
 * - Check dashboard
 * - View campaigns
 * - Check wallets
 * - View tokens
 * - Check settings
 *
 * Usage:
 *   k6 run backend/api/tests/load/mixed-scenario-load.test.js
 *   k6 run -e SCENARIO=spike backend/api/tests/load/mixed-scenario-load.test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { BASE_URL, API_PREFIX, scenarios, thresholds, getAuthHeaders } from './config.js';

// Custom metrics
const totalErrors = new Rate('total_errors');
const workflowDuration = new Trend('workflow_duration');
const apiCallsPerWorkflow = new Counter('api_calls_per_workflow');

export const options = {
  stages: scenarios[__ENV.SCENARIO || 'medium'].stages,
  thresholds: {
    ...thresholds,
    total_errors: ['rate<0.05'],
    workflow_duration: ['p(95)<10000'], // 95% of workflows under 10s
  },
};

export function setup() {
  console.log('Starting mixed scenario load test...');
  console.log('This test simulates realistic user workflows');

  const token = __ENV.AUTH_TOKEN;
  const headers = getAuthHeaders(token);

  // Pre-fetch campaign and wallet IDs
  let campaignId = null;
  let walletId = null;

  const campaignsResponse = http.get(`${BASE_URL}${API_PREFIX}/campaigns`, { headers });
  if (campaignsResponse.status === 200) {
    try {
      const campaigns = JSON.parse(campaignsResponse.body);
      if (campaigns.length > 0) {
        campaignId = campaigns[0].id;
      }
    } catch (e) {}
  }

  const walletsResponse = http.get(`${BASE_URL}${API_PREFIX}/wallets`, { headers });
  if (walletsResponse.status === 200) {
    try {
      const wallets = JSON.parse(walletsResponse.body);
      if (wallets.length > 0) {
        walletId = wallets[0].id;
      }
    } catch (e) {}
  }

  return { token, campaignId, walletId };
}

export default function(data) {
  const headers = getAuthHeaders(data.token);
  const workflowStart = Date.now();
  let callCount = 0;

  // Scenario 1: Dashboard Check (30% of users)
  if (Math.random() < 0.3) {
    group('Dashboard Workflow', function() {
      // Check auth
      const meResponse = http.get(`${BASE_URL}${API_PREFIX}/me`, { headers });
      check(meResponse, { 'me status is 200': (r) => r.status === 200 });
      totalErrors.add(meResponse.status !== 200);
      callCount++;
      sleep(0.3);

      // View metrics
      const metricsResponse = http.get(`${BASE_URL}${API_PREFIX}/dashboard/metrics`, { headers });
      check(metricsResponse, { 'metrics status is 200': (r) => r.status === 200 });
      totalErrors.add(metricsResponse.status !== 200);
      callCount++;
      sleep(0.5);

      // View activity
      const activityResponse = http.get(`${BASE_URL}${API_PREFIX}/dashboard/activity?limit=20`, { headers });
      check(activityResponse, { 'activity status is 200': (r) => r.status === 200 });
      totalErrors.add(activityResponse.status !== 200);
      callCount++;
    });
  }

  // Scenario 2: Campaign Management (40% of users)
  else if (Math.random() < 0.7) { // 0.3 + 0.4 = 0.7
    group('Campaign Workflow', function() {
      // List campaigns
      const listResponse = http.get(`${BASE_URL}${API_PREFIX}/campaigns`, { headers });
      check(listResponse, { 'campaigns list status is 200': (r) => r.status === 200 });
      totalErrors.add(listResponse.status !== 200);
      callCount++;
      sleep(0.5);

      if (data.campaignId) {
        // View campaign details
        const detailResponse = http.get(`${BASE_URL}${API_PREFIX}/campaigns/${data.campaignId}`, { headers });
        check(detailResponse, { 'campaign detail status is 200': (r) => r.status === 200 });
        totalErrors.add(detailResponse.status !== 200);
        callCount++;
        sleep(0.5);

        // Check campaign status
        const statusResponse = http.get(`${BASE_URL}${API_PREFIX}/campaigns/${data.campaignId}/status`, { headers });
        check(statusResponse, { 'campaign status is 200': (r) => r.status === 200 });
        totalErrors.add(statusResponse.status !== 200);
        callCount++;
        sleep(0.5);

        // View campaign runs
        const runsResponse = http.get(`${BASE_URL}${API_PREFIX}/campaigns/${data.campaignId}/runs`, { headers });
        check(runsResponse, { 'campaign runs status is 200': (r) => r.status === 200 });
        totalErrors.add(runsResponse.status !== 200);
        callCount++;
      }
    });
  }

  // Scenario 3: Wallet & Token Management (30% of users)
  else {
    group('Wallet & Token Workflow', function() {
      // List wallets
      const walletsResponse = http.get(`${BASE_URL}${API_PREFIX}/wallets`, { headers });
      check(walletsResponse, { 'wallets list status is 200': (r) => r.status === 200 });
      totalErrors.add(walletsResponse.status !== 200);
      callCount++;
      sleep(0.5);

      if (data.walletId) {
        // View wallet details
        const walletResponse = http.get(`${BASE_URL}${API_PREFIX}/wallets/${data.walletId}`, { headers });
        check(walletResponse, { 'wallet detail status is 200': (r) => r.status === 200 });
        totalErrors.add(walletResponse.status !== 200);
        callCount++;
        sleep(0.5);
      }

      // List tokens
      const tokensResponse = http.get(`${BASE_URL}${API_PREFIX}/tokens`, { headers });
      check(tokensResponse, { 'tokens list status is 200': (r) => r.status === 200 });
      totalErrors.add(tokensResponse.status !== 200);
      callCount++;
      sleep(0.5);

      // Check settings
      const settingsResponse = http.get(`${BASE_URL}${API_PREFIX}/settings`, { headers });
      check(settingsResponse, { 'settings status is 200': (r) => r.status === 200 });
      totalErrors.add(settingsResponse.status !== 200);
      callCount++;
    });
  }

  // Record workflow metrics
  workflowDuration.add(Date.now() - workflowStart);
  apiCallsPerWorkflow.add(callCount);

  // User think time between workflows
  sleep(Math.random() * 3 + 1); // 1-4 seconds
}

export function teardown(data) {
  console.log('Mixed scenario load test completed');
}
