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
 * Gets the appropriate transport configuration based on environment
 */
function getTransportConfig(isDevelopment: boolean) {
  // Development: Use pretty printing
  if (isDevelopment) {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    };
  }

  // Production: Use CloudWatch if configured, otherwise stdout JSON
  if (process.env.CLOUDWATCH_LOG_GROUP && process.env.AWS_REGION) {
    return {
      target: 'pino-cloudwatch',
      options: {
        logGroupName: process.env.CLOUDWATCH_LOG_GROUP,
        logStreamName: process.env.CLOUDWATCH_LOG_STREAM || `${process.env.NODE_ENV}-${Date.now()}`,
        awsRegion: process.env.AWS_REGION,
        awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        interval: 1000, // Batch logs every 1 second
      },
    };
  }

  // Default: No transport (stdout JSON for container log collection)
  return undefined;
}

/**
 * Creates a Pino logger instance with standardized configuration
 */
export function createLogger(options: LoggerOptions) {
  const { name, environment = process.env.NODE_ENV || 'development', level = 'info' } = options;

  const isDevelopment = environment === 'development';

  return pino({
    name,
    level: process.env.LOG_LEVEL || level,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      env: environment,
      service: name,
    },
    // Configure transport based on environment and settings
    transport: getTransportConfig(isDevelopment),
  });
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
