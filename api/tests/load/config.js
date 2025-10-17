// k6 Load Test Configuration
// This file contains shared configuration for all load tests

export const BASE_URL = __ENV.API_URL || 'http://localhost:3001';
export const API_PREFIX = '/v1';

// Test user credentials - should be set via environment variables
export const TEST_USER = {
  email: __ENV.TEST_USER_EMAIL || 'test@example.com',
  password: __ENV.TEST_USER_PASSWORD || 'testpassword123',
};

// Authentication token - will be populated during setup
export let AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

// Test scenarios configuration
export const scenarios = {
  // Light load - normal usage
  light: {
    stages: [
      { duration: '30s', target: 5 },   // Ramp up to 5 users
      { duration: '1m', target: 5 },    // Stay at 5 users
      { duration: '30s', target: 0 },   // Ramp down
    ],
  },

  // Medium load - moderate traffic
  medium: {
    stages: [
      { duration: '1m', target: 20 },   // Ramp up to 20 users
      { duration: '3m', target: 20 },   // Stay at 20 users
      { duration: '1m', target: 0 },    // Ramp down
    ],
  },

  // Heavy load - stress test
  heavy: {
    stages: [
      { duration: '2m', target: 50 },   // Ramp up to 50 users
      { duration: '5m', target: 50 },   // Stay at 50 users
      { duration: '2m', target: 100 },  // Spike to 100 users
      { duration: '3m', target: 50 },   // Back to 50 users
      { duration: '2m', target: 0 },    // Ramp down
    ],
  },

  // Spike test - sudden traffic surge
  spike: {
    stages: [
      { duration: '10s', target: 10 },  // Start with 10 users
      { duration: '30s', target: 100 }, // Spike to 100 users
      { duration: '1m', target: 100 },  // Hold the spike
      { duration: '30s', target: 10 },  // Drop back down
      { duration: '30s', target: 0 },   // Ramp down
    ],
  },
};

// Performance thresholds
export const thresholds = {
  // HTTP request duration
  http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s

  // HTTP request failed rate
  http_req_failed: ['rate<0.05'], // Less than 5% failures

  // HTTP requests per second
  http_reqs: ['rate>10'], // At least 10 requests per second

  // Iteration duration
  iteration_duration: ['p(95)<5000'], // 95% of iterations under 5s
};

// Helper function to get auth headers
export function getAuthHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token || AUTH_TOKEN}`,
  };
}

// Helper function to check response
export function checkResponse(response, expectedStatus = 200) {
  const passed = response.status === expectedStatus;
  if (!passed) {
    console.error(`Expected status ${expectedStatus}, got ${response.status}: ${response.body}`);
  }
  return passed;
}
