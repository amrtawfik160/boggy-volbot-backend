import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
import * as Sentry from '@sentry/node';

/**
 * OpenTelemetry Tracing Service
 *
 * Provides distributed tracing across API and worker processes using OpenTelemetry.
 * Supports multiple exporters:
 * - Sentry: Integrated with existing Sentry error tracking
 * - OTLP: Standard protocol for sending traces to collectors (Jaeger, Tempo, etc.)
 *
 * Auto-instruments:
 * - HTTP/HTTPS requests and responses
 * - Express middleware and routes
 * - Database queries (PostgreSQL via pg)
 * - Redis operations (ioredis)
 * - DNS lookups
 * - And more via @opentelemetry/auto-instrumentations-node
 *
 * Environment Variables:
 * - OTEL_ENABLED: Enable/disable tracing (default: true)
 * - OTEL_SERVICE_NAME: Service name for traces (default: volume-bot-api)
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP collector endpoint (optional)
 * - OTEL_EXPORTER_OTLP_HEADERS: Headers for OTLP (optional, e.g., "key=value,key2=value2")
 * - SENTRY_DSN: Sentry DSN (required for Sentry traces)
 * - SENTRY_TRACES_SAMPLE_RATE: Sentry trace sampling rate (0.0-1.0, default: 0.1)
 */
@Injectable()
export class TracingService implements OnModuleInit {
  private readonly logger = new Logger(TracingService.name);
  private sdk: NodeSDK | null = null;
  private isInitialized = false;

  async onModuleInit() {
    try {
      await this.initialize();
    } catch (error) {
      this.logger.error('Failed to initialize OpenTelemetry tracing', error);
      // Don't throw - allow app to continue without tracing
    }
  }

  /**
   * Initialize OpenTelemetry SDK
   * Should be called as early as possible in the application lifecycle
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('Tracing already initialized');
      return;
    }

    const enabled =
      process.env.OTEL_ENABLED === undefined ||
      process.env.OTEL_ENABLED === 'true';

    if (!enabled) {
      this.logger.log('OpenTelemetry tracing is disabled');
      return;
    }

    const serviceName =
      process.env.OTEL_SERVICE_NAME || 'volume-bot-api';
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const sentryDsn = process.env.SENTRY_DSN;
    const tracesSampleRate = parseFloat(
      process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1',
    );

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
      this.logger.log('Configuring Sentry trace exporter');
      spanProcessors.push(new SentrySpanProcessor());
    }

    // Add OTLP exporter if endpoint is configured
    if (otlpEndpoint) {
      this.logger.log(
        `Configuring OTLP trace exporter: ${otlpEndpoint}`,
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

    if (spanProcessors.length === 0) {
      this.logger.warn(
        'No trace exporters configured. Set SENTRY_DSN or OTEL_EXPORTER_OTLP_ENDPOINT to enable tracing',
      );
      return;
    }

    // Configure SDK
    this.sdk = new NodeSDK({
      resource,
      spanProcessors,
      textMapPropagator: sentryDsn ? new SentryPropagator() : undefined,
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
    await this.sdk.start();
    this.isInitialized = true;

    this.logger.log(
      `OpenTelemetry tracing initialized for service: ${serviceName}`,
    );
    this.logger.log(
      `Traces sample rate: ${tracesSampleRate * 100}%`,
    );
    this.logger.log(
      `Exporters: ${spanProcessors.map((p) => p.constructor.name).join(', ')}`,
    );
  }

  /**
   * Shutdown the SDK gracefully
   * Should be called when the application is shutting down
   */
  async shutdown(): Promise<void> {
    if (this.sdk && this.isInitialized) {
      this.logger.log('Shutting down OpenTelemetry tracing');
      await this.sdk.shutdown();
      this.isInitialized = false;
      this.sdk = null;
    }
  }

  /**
   * Check if tracing is initialized and active
   */
  isActive(): boolean {
    return this.isInitialized && this.sdk !== null;
  }
}
