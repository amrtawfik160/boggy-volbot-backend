/**
 * OpenTelemetry Tracing Test Script
 *
 * This script generates sample traces to verify the tracing setup.
 * Run with: ts-node src/tracing/test-tracing.ts
 *
 * Prerequisites:
 * - SENTRY_DSN set in environment (for Sentry traces)
 * - OR OTEL_EXPORTER_OTLP_ENDPOINT set (for OTLP traces)
 */

// Import tracing first (required for auto-instrumentation)
import './init';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { withSpan } from './trace.decorator';

const tracer = trace.getTracer('volume-bot-test');

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testHttpSpan() {
  const span = tracer.startSpan('test.http-request', {
    attributes: {
      'http.method': 'GET',
      'http.url': '/api/campaigns',
      'http.status_code': 200,
    },
  });

  await context.with(trace.setSpan(context.active(), span), async () => {
    console.log('  Simulating HTTP request...');
    await sleep(50);

    // Simulate DB query
    const dbSpan = tracer.startSpan('db.query', {
      attributes: {
        'db.system': 'postgresql',
        'db.statement': 'SELECT * FROM campaigns',
      },
    });
    await sleep(20);
    dbSpan.end();

    console.log('  HTTP request completed');
  });

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

async function testJobProcessing() {
  const span = tracer.startSpan('test.job.process:trade.buy.buy-token', {
    attributes: {
      'messaging.system': 'bullmq',
      'messaging.operation': 'process',
      'messaging.destination': 'trade.buy',
      'job.id': 'test-123',
      'job.name': 'buy-token',
      'job.queue': 'trade.buy',
      'job.attempt': 1,
      'job.data': JSON.stringify({
        campaignId: 'campaign-1',
        walletId: 'wallet-1',
        amount: 0.001,
      }),
    },
  });

  await context.with(trace.setSpan(context.active(), span), async () => {
    console.log('  Simulating job processing...');

    // Simulate RPC call
    const rpcSpan = tracer.startSpan('rpc.getTokenBalance', {
      attributes: {
        'rpc.method': 'getTokenBalance',
        'rpc.endpoint': 'https://api.mainnet-beta.solana.com',
      },
    });
    await sleep(100);
    rpcSpan.end();

    // Simulate trading logic
    await sleep(50);

    console.log('  Job processing completed');
  });

  span.setStatus({ code: SpanStatusCode.OK });
  span.setAttribute('job.result', 'success');
  span.end();
}

async function testErrorSpan() {
  const span = tracer.startSpan('test.error-handling', {
    attributes: {
      'operation': 'test-error',
    },
  });

  await context.with(trace.setSpan(context.active(), span), async () => {
    console.log('  Simulating error...');
    await sleep(30);

    const error = new Error('Test error for tracing');
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });

    console.log('  Error recorded');
  });

  span.end();
}

async function testNestedSpans() {
  return await withSpan('test.nested-operation', async (parentSpan) => {
    console.log('  Starting nested operation...');
    parentSpan.setAttribute('operation.type', 'nested');

    await sleep(20);

    // Child span 1
    await withSpan('test.child-1', async (childSpan1) => {
      childSpan1.setAttribute('child.index', 1);
      await sleep(30);
    });

    // Child span 2
    await withSpan('test.child-2', async (childSpan2) => {
      childSpan2.setAttribute('child.index', 2);
      await sleep(40);
    });

    parentSpan.addEvent('All children completed');
    console.log('  Nested operation completed');

    return { success: true };
  });
}

async function testConcurrentSpans() {
  console.log('  Creating concurrent spans...');

  const operations = [
    withSpan('test.concurrent-1', async (span) => {
      span.setAttribute('concurrent.id', 1);
      await sleep(100);
    }),
    withSpan('test.concurrent-2', async (span) => {
      span.setAttribute('concurrent.id', 2);
      await sleep(80);
    }),
    withSpan('test.concurrent-3', async (span) => {
      span.setAttribute('concurrent.id', 3);
      await sleep(60);
    }),
  ];

  await Promise.all(operations);
  console.log('  Concurrent operations completed');
}

async function main() {
  console.log('🔍 OpenTelemetry Tracing Test\n');

  // Check configuration
  console.log('Configuration:');
  console.log(`  OTEL_ENABLED: ${process.env.OTEL_ENABLED || 'true (default)'}`);
  console.log(`  OTEL_SERVICE_NAME: ${process.env.OTEL_SERVICE_NAME || 'volume-bot-api (default)'}`);
  console.log(`  SENTRY_DSN: ${process.env.SENTRY_DSN ? '✓ Set' : '✗ Not set'}`);
  console.log(`  OTEL_EXPORTER_OTLP_ENDPOINT: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '✗ Not set'}\n`);

  if (!process.env.SENTRY_DSN && !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    console.log('⚠️  Warning: No exporters configured!');
    console.log('   Set SENTRY_DSN or OTEL_EXPORTER_OTLP_ENDPOINT to export traces.\n');
  }

  try {
    console.log('Test 1: HTTP Request Simulation');
    await testHttpSpan();
    console.log('✓ HTTP span created\n');

    console.log('Test 2: BullMQ Job Processing Simulation');
    await testJobProcessing();
    console.log('✓ Job processing span created\n');

    console.log('Test 3: Error Handling');
    await testErrorSpan();
    console.log('✓ Error span created\n');

    console.log('Test 4: Nested Spans');
    await testNestedSpans();
    console.log('✓ Nested spans created\n');

    console.log('Test 5: Concurrent Spans');
    await testConcurrentSpans();
    console.log('✓ Concurrent spans created\n');

    console.log('✅ All tests completed successfully!\n');

    // Wait for traces to be exported
    console.log('Waiting for traces to be exported...');
    await sleep(3000);

    console.log('\n📊 Next Steps:');
    if (process.env.SENTRY_DSN) {
      console.log('  • Check Sentry Performance tab for traces');
      console.log('  • Look for traces with operation names starting with "test."');
    }
    if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      console.log('  • Check your OTLP collector (e.g., Jaeger UI at http://localhost:16686)');
      console.log('  • Search for service: "volume-bot-api"');
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the tests
main();
