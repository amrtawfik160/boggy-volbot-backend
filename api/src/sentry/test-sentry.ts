/**
 * Test script for Sentry error tracking
 *
 * Usage:
 * 1. Set SENTRY_DSN in your .env file
 * 2. Run: npx ts-node src/sentry/test-sentry.ts
 */

import * as Sentry from '@sentry/node';

// Initialize Sentry
if (!process.env.SENTRY_DSN) {
  console.error('Error: SENTRY_DSN environment variable is not set');
  console.log('Please set SENTRY_DSN in your .env file to test Sentry integration');
  process.exit(1);
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || 'development',
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '1.0'),
  integrations: [
    ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
  ],
});

console.log('Sentry initialized successfully');
console.log(`Environment: ${process.env.SENTRY_ENVIRONMENT || 'development'}`);
console.log('\nRunning tests...\n');

// Test 1: Capture a simple message
console.log('Test 1: Capturing a simple message...');
Sentry.captureMessage('Test message from Sentry integration test', 'info');
console.log('✓ Message sent\n');

// Test 2: Capture an error with context
console.log('Test 2: Capturing an error with context...');
Sentry.withScope((scope) => {
  scope.setContext('test_context', {
    test_id: 'test-2',
    description: 'Error with custom context',
  });
  scope.setTag('test_type', 'integration_test');
  scope.setUser({
    id: 'test-user-123',
    email: 'test@example.com',
    username: 'test_user',
  });

  const error = new Error('Test error with context');
  Sentry.captureException(error);
});
console.log('✓ Error with context sent\n');

// Test 3: Capture a breadcrumb trail
console.log('Test 3: Capturing error with breadcrumb trail...');
Sentry.addBreadcrumb({
  type: 'http',
  category: 'request',
  message: 'Test HTTP request',
  level: 'info',
  data: {
    method: 'GET',
    url: '/api/test',
    status_code: 200,
  },
});

Sentry.addBreadcrumb({
  type: 'query',
  category: 'database',
  message: 'Test database query',
  level: 'info',
  data: {
    query: 'SELECT * FROM users WHERE id = ?',
  },
});

const errorWithBreadcrumbs = new Error('Test error with breadcrumb trail');
Sentry.captureException(errorWithBreadcrumbs);
console.log('✓ Error with breadcrumbs sent\n');

// Test 4: Capture a transaction for performance monitoring
console.log('Test 4: Capturing a performance transaction...');
const transaction = Sentry.startTransaction({
  op: 'test',
  name: 'Test Transaction',
});

// Simulate some work
const span = transaction.startChild({
  op: 'database',
  description: 'Test database query',
});

setTimeout(() => {
  span.finish();
  transaction.finish();
  console.log('✓ Performance transaction sent\n');

  // Give Sentry time to send events
  console.log('Flushing events to Sentry...');
  Sentry.close(2000).then(() => {
    console.log('\n✅ All tests completed!');
    console.log('\nPlease check your Sentry dashboard at:');
    console.log('https://sentry.io/organizations/[YOUR_ORG]/issues/');
    console.log('\nYou should see:');
    console.log('- 1 info message: "Test message from Sentry integration test"');
    console.log('- 2 errors with different contexts and breadcrumbs');
    console.log('- 1 performance transaction');
  });
}, 100);
