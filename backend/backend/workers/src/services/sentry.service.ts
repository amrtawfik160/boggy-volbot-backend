import * as Sentry from '@sentry/node';

export interface SentryConfig {
  dsn?: string;
  environment?: string;
  tracesSampleRate?: number;
  enabled?: boolean;
}

export class SentryService {
  private static initialized = false;

  static initialize() {
    const config = this.getConfig();

    if (!config.enabled || !config.dsn) {
      console.log('Sentry is disabled or DSN not configured');
      return;
    }

    Sentry.init({
      dsn: config.dsn,
      environment: config.environment || 'development',
      tracesSampleRate: config.tracesSampleRate || 0.1,

      // Enable performance monitoring
      integrations: [
        // Automatically instrument Node.js libraries and frameworks
        ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
      ],

      // Set up error filtering
      beforeSend(event, hint) {
        // Filter out common non-critical errors
        const error = hint.originalException;
        if (error instanceof Error) {
          // Skip common rate limiting errors
          if (error.message?.includes('rate limit') || error.message?.includes('429')) {
            return null;
          }
        }
        return event;
      },
    });

    this.initialized = true;
    console.log(`Sentry initialized for environment: ${config.environment}`);
  }

  static async close() {
    if (this.initialized) {
      await Sentry.close(2000);
    }
  }

  private static getConfig(): SentryConfig {
    return {
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      enabled: !!process.env.SENTRY_DSN,
    };
  }

  /**
   * Capture an exception manually
   */
  static captureException(exception: any, context?: Record<string, any>) {
    if (!this.initialized) return;

    if (context) {
      Sentry.withScope((scope) => {
        Object.entries(context).forEach(([key, value]) => {
          scope.setContext(key, value);
        });
        Sentry.captureException(exception);
      });
    } else {
      Sentry.captureException(exception);
    }
  }

  /**
   * Capture a message manually
   */
  static captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>) {
    if (!this.initialized) return;

    if (context) {
      Sentry.withScope((scope) => {
        Object.entries(context).forEach(([key, value]) => {
          scope.setContext(key, value);
        });
        Sentry.captureMessage(message, level);
      });
    } else {
      Sentry.captureMessage(message, level);
    }
  }

  /**
   * Add breadcrumb for better error context
   */
  static addBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
    if (!this.initialized) return;
    Sentry.addBreadcrumb(breadcrumb);
  }

  /**
   * Set user context for error tracking
   */
  static setUser(user: { id: string; email?: string; username?: string }) {
    if (!this.initialized) return;
    Sentry.setUser(user);
  }

  /**
   * Clear user context
   */
  static clearUser() {
    if (!this.initialized) return;
    Sentry.setUser(null);
  }

  /**
   * Set custom context/tags
   */
  static setContext(key: string, value: any) {
    if (!this.initialized) return;
    Sentry.setContext(key, value);
  }

  /**
   * Set tags for filtering
   */
  static setTag(key: string, value: string) {
    if (!this.initialized) return;
    Sentry.setTag(key, value);
  }

  /**
   * Start a transaction for performance monitoring
   */
  static startTransaction(context: { op: string; name: string; data?: any }) {
    if (!this.initialized) return null;
    return Sentry.startTransaction(context);
  }

  /**
   * Get the native Sentry instance for advanced usage
   */
  static getInstance() {
    return Sentry;
  }
}
