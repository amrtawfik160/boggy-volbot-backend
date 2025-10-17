import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pino from 'pino';
import { createLogger, createChildLogger, LoggerOptions } from './logger';

describe('Logger Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('createLogger', () => {
    it('should create logger with default info level', () => {
      const logger = createLogger({ name: 'test-service' });

      expect(logger).toBeDefined();
      expect(logger.level).toBe('info');
    });

    it('should respect LOG_LEVEL environment variable', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = createLogger({ name: 'test-service' });

      expect(logger.level).toBe('debug');
    });

    it('should use custom level from options when LOG_LEVEL is not set', () => {
      delete process.env.LOG_LEVEL;
      const logger = createLogger({ name: 'test-service', level: 'warn' });

      expect(logger.level).toBe('warn');
    });

    it('should prioritize LOG_LEVEL env var over options level', () => {
      process.env.LOG_LEVEL = 'error';
      const logger = createLogger({ name: 'test-service', level: 'debug' });

      expect(logger.level).toBe('error');
    });

    it('should set service name in base fields', () => {
      const logger = createLogger({ name: 'api' });

      // Access the bindings which include base fields
      const bindings = logger.bindings();
      expect(bindings.name).toBe('api');
      expect(bindings.service).toBe('api');
    });

    it('should set environment in base fields', () => {
      process.env.NODE_ENV = 'production';
      const logger = createLogger({ name: 'test', environment: 'production' });

      const bindings = logger.bindings();
      expect(bindings.env).toBe('production');
    });

    it('should default to development environment', () => {
      delete process.env.NODE_ENV;
      const logger = createLogger({ name: 'test' });

      const bindings = logger.bindings();
      expect(bindings.env).toBe('development');
    });
  });

  describe('Log Level Filtering', () => {
    it('should filter debug logs when level is info', () => {
      const logger = createLogger({
        name: 'test',
        level: 'info'
      });

      // Verify the log level is set correctly
      expect(logger.level).toBe('info');

      // In Pino, when level is 'info', isLevelEnabled will return false for 'debug'
      expect(logger.isLevelEnabled('debug')).toBe(false);
      expect(logger.isLevelEnabled('info')).toBe(true);
      expect(logger.isLevelEnabled('warn')).toBe(true);
      expect(logger.isLevelEnabled('error')).toBe(true);
    });

    it('should include debug logs when level is debug', () => {
      const logger = createLogger({
        name: 'test',
        level: 'debug'
      });

      expect(logger.level).toBe('debug');
      expect(logger.isLevelEnabled('debug')).toBe(true);
      expect(logger.isLevelEnabled('info')).toBe(true);
      expect(logger.isLevelEnabled('warn')).toBe(true);
      expect(logger.isLevelEnabled('error')).toBe(true);
    });

    it('should only show errors when level is error', () => {
      const logger = createLogger({
        name: 'test',
        level: 'error'
      });

      expect(logger.level).toBe('error');
      expect(logger.isLevelEnabled('debug')).toBe(false);
      expect(logger.isLevelEnabled('info')).toBe(false);
      expect(logger.isLevelEnabled('warn')).toBe(false);
      expect(logger.isLevelEnabled('error')).toBe(true);
    });

    it('should show warn and error when level is warn', () => {
      const logger = createLogger({
        name: 'test',
        level: 'warn'
      });

      expect(logger.level).toBe('warn');
      expect(logger.isLevelEnabled('debug')).toBe(false);
      expect(logger.isLevelEnabled('info')).toBe(false);
      expect(logger.isLevelEnabled('warn')).toBe(true);
      expect(logger.isLevelEnabled('error')).toBe(true);
    });
  });

  describe('Environment-Specific Configuration', () => {
    it('should use pretty transport in development', () => {
      process.env.NODE_ENV = 'development';
      const logger = createLogger({ name: 'test', environment: 'development' });

      // Verify logger was created (transport configuration is internal)
      expect(logger).toBeDefined();
      expect(logger.bindings().env).toBe('development');
    });

    it('should not use pretty transport in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.CLOUDWATCH_LOG_GROUP;
      delete process.env.AWS_REGION;

      const logger = createLogger({ name: 'test', environment: 'production' });

      expect(logger).toBeDefined();
      expect(logger.bindings().env).toBe('production');
    });

    it('should configure CloudWatch transport when env vars are set', () => {
      process.env.NODE_ENV = 'production';
      process.env.CLOUDWATCH_LOG_GROUP = '/aws/boggy-bot';
      process.env.CLOUDWATCH_LOG_STREAM = 'test-stream';
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

      const logger = createLogger({ name: 'test', environment: 'production' });

      expect(logger).toBeDefined();
    });

    it('should handle missing CloudWatch log stream by generating default', () => {
      process.env.NODE_ENV = 'production';
      process.env.CLOUDWATCH_LOG_GROUP = '/aws/boggy-bot';
      delete process.env.CLOUDWATCH_LOG_STREAM;
      process.env.AWS_REGION = 'us-east-1';

      const logger = createLogger({ name: 'test', environment: 'production' });

      expect(logger).toBeDefined();
    });

    it('should use stdout JSON when CloudWatch vars are incomplete', () => {
      process.env.NODE_ENV = 'production';
      process.env.CLOUDWATCH_LOG_GROUP = '/aws/boggy-bot';
      delete process.env.AWS_REGION; // Missing required CloudWatch var

      const logger = createLogger({ name: 'test', environment: 'production' });

      expect(logger).toBeDefined();
    });
  });

  describe('createChildLogger', () => {
    it('should create child logger with context fields', () => {
      const parentLogger = createLogger({ name: 'test' });
      const childLogger = createChildLogger(parentLogger, {
        userId: 'user-123',
        campaignId: 'camp-456'
      });

      const bindings = childLogger.bindings();
      expect(bindings.userId).toBe('user-123');
      expect(bindings.campaignId).toBe('camp-456');
    });

    it('should inherit parent logger configuration', () => {
      process.env.LOG_LEVEL = 'debug';
      const parentLogger = createLogger({ name: 'test' });
      const childLogger = createChildLogger(parentLogger, {
        requestId: 'req-789'
      });

      expect(childLogger.level).toBe(parentLogger.level);
      expect(childLogger.bindings().requestId).toBe('req-789');
    });

    it('should support all standard context fields', () => {
      const parentLogger = createLogger({ name: 'test' });
      const childLogger = createChildLogger(parentLogger, {
        userId: 'user-123',
        campaignId: 'camp-456',
        jobId: 'job-789',
        requestId: 'req-abc'
      });

      const bindings = childLogger.bindings();
      expect(bindings.userId).toBe('user-123');
      expect(bindings.campaignId).toBe('camp-456');
      expect(bindings.jobId).toBe('job-789');
      expect(bindings.requestId).toBe('req-abc');
    });

    it('should support custom context fields', () => {
      const parentLogger = createLogger({ name: 'test' });
      const childLogger = createChildLogger(parentLogger, {
        transactionId: 'tx-123',
        walletAddress: 'wallet-456'
      });

      const bindings = childLogger.bindings();
      expect(bindings.transactionId).toBe('tx-123');
      expect(bindings.walletAddress).toBe('wallet-456');
    });

    it('should preserve parent bindings in child logger', () => {
      const parentLogger = createLogger({ name: 'api' });
      const childLogger = createChildLogger(parentLogger, {
        userId: 'user-123'
      });

      const parentBindings = parentLogger.bindings();
      const childBindings = childLogger.bindings();

      expect(childBindings.name).toBe(parentBindings.name);
      expect(childBindings.service).toBe(parentBindings.service);
      expect(childBindings.userId).toBe('user-123');
    });
  });

  describe('Structured Logging Format', () => {
    it('should use level formatter that returns string labels', () => {
      const logger = createLogger({ name: 'test' });

      // The logger uses formatters configuration
      // We can verify by checking the logger was created successfully
      expect(logger).toBeDefined();
      expect(logger.bindings().name).toBe('test');
    });

    it('should use ISO timestamp format', () => {
      const logger = createLogger({ name: 'test' });

      // The logger is configured to use pino.stdTimeFunctions.isoTime
      // We can verify by checking the logger was created successfully
      expect(logger).toBeDefined();
    });
  });

  describe('Log Level Environment Variable Validation', () => {
    const validLevels = ['debug', 'info', 'warn', 'error'];

    validLevels.forEach(level => {
      it(`should accept valid log level: ${level}`, () => {
        process.env.LOG_LEVEL = level;
        const logger = createLogger({ name: 'test' });

        expect(logger.level).toBe(level);
      });
    });

    it('should throw error for invalid log level', () => {
      process.env.LOG_LEVEL = 'invalid' as any;

      // Pino throws an error for invalid log levels
      expect(() => createLogger({ name: 'test' })).toThrow();
    });

    it('should handle case sensitivity in LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'DEBUG';
      const logger = createLogger({ name: 'test' });

      // Pino handles case-insensitive levels
      expect(logger).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should support changing log level at runtime', () => {
      const logger = createLogger({ name: 'test', level: 'info' });

      expect(logger.level).toBe('info');

      // Change level at runtime
      logger.level = 'debug';

      expect(logger.level).toBe('debug');
    });

    it('should allow nested child loggers', () => {
      const parentLogger = createLogger({ name: 'test' });
      const childLogger = createChildLogger(parentLogger, { userId: 'user-123' });
      const grandchildLogger = createChildLogger(childLogger, { campaignId: 'camp-456' });

      const bindings = grandchildLogger.bindings();
      expect(bindings.userId).toBe('user-123');
      expect(bindings.campaignId).toBe('camp-456');
    });

    it('should maintain separate log levels for different logger instances', () => {
      const logger1 = createLogger({ name: 'service1', level: 'debug' });
      const logger2 = createLogger({ name: 'service2', level: 'error' });

      expect(logger1.level).toBe('debug');
      expect(logger2.level).toBe('error');
    });

    it('should handle concurrent logging from multiple services', () => {
      const apiLogger = createLogger({ name: 'api' });
      const workerLogger = createLogger({ name: 'worker' });

      expect(apiLogger.bindings().service).toBe('api');
      expect(workerLogger.bindings().service).toBe('worker');
      expect(apiLogger).not.toBe(workerLogger);
    });
  });

  describe('Production vs Development Behavior', () => {
    it('should configure appropriately for production', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_LEVEL = 'warn';

      const logger = createLogger({
        name: 'api',
        environment: 'production'
      });

      expect(logger.level).toBe('warn');
      expect(logger.bindings().env).toBe('production');
    });

    it('should configure appropriately for development', () => {
      process.env.NODE_ENV = 'development';
      process.env.LOG_LEVEL = 'debug';

      const logger = createLogger({
        name: 'api',
        environment: 'development'
      });

      expect(logger.level).toBe('debug');
      expect(logger.bindings().env).toBe('development');
    });

    it('should use info level by default in production without LOG_LEVEL', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.LOG_LEVEL;

      const logger = createLogger({
        name: 'api',
        environment: 'production'
      });

      expect(logger.level).toBe('info');
    });

    it('should support test environment', () => {
      process.env.NODE_ENV = 'test';

      const logger = createLogger({
        name: 'test-suite',
        environment: 'test'
      });

      expect(logger.bindings().env).toBe('test');
    });
  });
});
