import pino from 'pino';

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  /** Service name (e.g., 'api', 'worker') */
  name: string;
  /** Environment (development, test, production) */
  environment?: string;
  /** Minimum log level */
  level?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Creates a Pino logger instance with standardized configuration
 */
export function createLogger(options: LoggerOptions) {
  const { name, environment = process.env.NODE_ENV || 'development', level = 'info' } = options;

  const isDevelopment = environment === 'development';

  // Base logger configuration
  const baseConfig: pino.LoggerOptions = {
    name,
    level: process.env.LOG_LEVEL || level,
    formatters: {
      level: (label: string) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      env: environment,
      service: name,
    },
  };

  // Only add transport in development
  if (isDevelopment) {
    try {
      // Only use pino-pretty if available (development)
      return pino({
        ...baseConfig,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      });
    } catch (error) {
      // If pino-pretty is not available, fall back to plain JSON
      console.warn('pino-pretty not available, using JSON logging');
      return pino(baseConfig);
    }
  }

  // Production: use plain JSON logging
  return pino(baseConfig);
}

/**
 * Creates a child logger with additional context fields
 */
export function createChildLogger(
  parentLogger: pino.Logger,
  context: {
    userId?: string;
    campaignId?: string;
    jobId?: string;
    requestId?: string;
    [key: string]: any;
  }
) {
  return parentLogger.child(context);
}
