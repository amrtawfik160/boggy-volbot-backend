/**
 * OpenTelemetry Tracing Initialization
 *
 * This file MUST be imported first before any other application code
 * to ensure auto-instrumentation captures all operations.
 *
 * Import this at the very top of main.ts:
 * ```typescript
 * import './tracing/init'; // Must be first!
 * import 'reflect-metadata';
 * // ... rest of imports
 * ```
 */

// Load environment variables FIRST before any other imports
import 'dotenv/config';

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import {
  SentrySpanProcessor,
  SentryPropagator,
} from '@sentry/opentelemetry-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import * as Sentry from '@sentry/node';

// Check if tracing is enabled
const enabled =
  process.env.OTEL_ENABLED === undefined ||
  process.env.OTEL_ENABLED === 'true';

if (enabled) {
  const serviceName =
    process.env.OTEL_SERVICE_NAME || 'volume-bot-api';
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const sentryDsn = process.env.SENTRY_DSN;

  // Build resource with service information
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]:
      process.env.npm_package_version || '0.1.0',
    'deployment.environment':
      process.env.NODE_ENV || 'development',
  });

  // Configure span processors
  const spanProcessors: any[] = [];

  // Add Sentry span processor if Sentry is configured
  if (sentryDsn) {
    // Initialize Sentry first (required for SentrySpanProcessor)
    Sentry.init({
      dsn: sentryDsn,
      environment:
        process.env.SENTRY_ENVIRONMENT ||
        process.env.NODE_ENV ||
        'development',
      tracesSampleRate: parseFloat(
        process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1',
      ),
      integrations: [
        ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
      ],
    });

    console.log('[OpenTelemetry] Configuring Sentry trace exporter');
    spanProcessors.push(new SentrySpanProcessor());
  }

  // Add OTLP exporter if endpoint is configured
  if (otlpEndpoint) {
    console.log(
      `[OpenTelemetry] Configuring OTLP trace exporter: ${otlpEndpoint}`,
    );

    // Parse OTLP headers if provided
    const headers: Record<string, string> = {};
    const headersEnv = process.env.OTEL_EXPORTER_OTLP_HEADERS;
    if (headersEnv) {
      headersEnv.split(',').forEach((pair) => {
        const [key, value] = pair.split('=');
        if (key && value) {
          headers[key.trim()] = value.trim();
        }
      });
    }

    const otlpExporter = new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
      headers,
    });

    spanProcessors.push(new BatchSpanProcessor(otlpExporter));
  }

  if (spanProcessors.length > 0) {
    // Configure trace sampling
    const tracesSampleRate = parseFloat(
      process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1',
    );

    // Configure SDK
    const sdk = new NodeSDK({
      resource,
      spanProcessors,
      textMapPropagator: sentryDsn
        ? new SentryPropagator()
        : undefined,
      sampler: new TraceIdRatioBasedSampler(tracesSampleRate),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Fine-tune instrumentation
          '@opentelemetry/instrumentation-fs': {
            enabled: false, // Disable fs to reduce noise
          },
          '@opentelemetry/instrumentation-http': {
            enabled: true,
            ignoreIncomingPaths: [
              '/health', // Don't trace health checks
              '/metrics', // Don't trace metrics endpoint
            ],
          },
          '@opentelemetry/instrumentation-express': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-pg': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-ioredis': {
            enabled: true,
          },
        }),
      ],
    });

    // Start the SDK
    try {
      sdk.start();
      console.log(
        `[OpenTelemetry] Tracing initialized for service: ${serviceName}`,
      );
      console.log(
        `[OpenTelemetry] Exporters: ${spanProcessors.map((p) => p.constructor.name).join(', ')}`,
      );
    } catch (error) {
      console.error(
        '[OpenTelemetry] Failed to initialize tracing:',
        error,
      );
    }

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      try {
        await sdk.shutdown();
        console.log('[OpenTelemetry] Tracing shut down');
      } catch (error) {
        console.error(
          '[OpenTelemetry] Error shutting down tracing:',
          error,
        );
      }
    });
  } else {
    console.log(
      '[OpenTelemetry] No trace exporters configured. Set SENTRY_DSN or OTEL_EXPORTER_OTLP_ENDPOINT to enable tracing',
    );
  }
} else {
  console.log('[OpenTelemetry] Tracing is disabled');
}
