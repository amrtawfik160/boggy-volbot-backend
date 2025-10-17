import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Environment,
  loadEnvironmentConfig,
  validateEnvironmentConfig,
} from './environment';

describe('Environment Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    // Clear the cached config
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('loadEnvironmentConfig', () => {
    it('should load development config with defaults', () => {
      process.env.NODE_ENV = 'development';
      const config = loadEnvironmentConfig();

      expect(config.nodeEnv).toBe(Environment.Development);
      expect(config.apiPort).toBe(3001);
      expect(config.supabaseUrl).toBe('http://localhost:54321');
      expect(config.redisUrl).toBe('redis://localhost:6379');
    });

    it('should load custom API port', () => {
      process.env.NODE_ENV = 'development';
      process.env.API_PORT = '4000';
      const config = loadEnvironmentConfig();

      expect(config.apiPort).toBe(4000);
    });

    it('should load custom Supabase configuration', () => {
      process.env.NODE_ENV = 'development';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-anon';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';

      const config = loadEnvironmentConfig();

      expect(config.supabaseUrl).toBe('https://test.supabase.co');
      expect(config.supabaseAnonKey).toBe('test-anon');
      expect(config.supabaseServiceRoleKey).toBe('test-service');
    });

    it('should load custom Redis URL', () => {
      process.env.NODE_ENV = 'development';
      process.env.REDIS_URL = 'redis://custom:6380';
      const config = loadEnvironmentConfig();

      expect(config.redisUrl).toBe('redis://custom:6380');
    });

    it('should load optional trading configuration', () => {
      process.env.NODE_ENV = 'development';
      process.env.BUY_LOWER_AMOUNT = '0.005';
      process.env.BUY_UPPER_AMOUNT = '0.01';
      process.env.DISTRIBUTE_WALLET_NUM = '10';

      const config = loadEnvironmentConfig();

      expect(config.buyLowerAmount).toBe(0.005);
      expect(config.buyUpperAmount).toBe(0.01);
      expect(config.distributeWalletNum).toBe(10);
    });

    it('should load optional Solana RPC URL', () => {
      process.env.NODE_ENV = 'development';
      process.env.SOLANA_RPC_URL = 'https://custom-rpc.com';
      const config = loadEnvironmentConfig();

      expect(config.solanaRpcUrl).toBe('https://custom-rpc.com');
    });

    it('should load optional CORS origin', () => {
      process.env.NODE_ENV = 'development';
      process.env.CORS_ORIGIN = 'https://example.com';
      const config = loadEnvironmentConfig();

      expect(config.corsOrigin).toBe('https://example.com');
    });
  });

  describe('Production validation', () => {
    it('should throw error when Supabase URL is missing in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SUPABASE_URL;
      process.env.SUPABASE_ANON_KEY = 'test';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.MASTER_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

      expect(() => loadEnvironmentConfig()).toThrow(
        'Missing required environment variables in production: supabaseUrl',
      );
    });

    it('should throw error when Supabase anon key is missing in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      delete process.env.SUPABASE_ANON_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.MASTER_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

      expect(() => loadEnvironmentConfig()).toThrow(
        'Missing required environment variables in production: supabaseAnonKey',
      );
    });

    it('should throw error when Supabase service role key is missing in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.MASTER_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

      expect(() => loadEnvironmentConfig()).toThrow(
        'Missing required environment variables in production: supabaseServiceRoleKey',
      );
    });

    it('should throw error when Redis URL is missing in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
      delete process.env.REDIS_URL;
      process.env.MASTER_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

      expect(() => loadEnvironmentConfig()).toThrow(
        'Missing required environment variables in production: redisUrl',
      );
    });

    it('should throw error when master encryption key is missing in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
      process.env.REDIS_URL = 'redis://localhost:6379';
      delete process.env.MASTER_ENCRYPTION_KEY;

      expect(() => loadEnvironmentConfig()).toThrow(
        'Missing required environment variables in production: masterEncryptionKey',
      );
    });

    it('should throw error when multiple required variables are missing in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.REDIS_URL;

      expect(() => loadEnvironmentConfig()).toThrow(
        'Missing required environment variables in production',
      );
      expect(() => loadEnvironmentConfig()).toThrow('supabaseUrl');
      expect(() => loadEnvironmentConfig()).toThrow('supabaseAnonKey');
      expect(() => loadEnvironmentConfig()).toThrow('redisUrl');
    });

    it('should succeed when all required variables are present in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-anon';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.MASTER_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

      const config = loadEnvironmentConfig();

      expect(config.nodeEnv).toBe(Environment.Production);
      expect(config.supabaseUrl).toBe('https://test.supabase.co');
      expect(config.redisUrl).toBe('redis://localhost:6379');
    });
  });

  describe('Encryption key validation', () => {
    it('should validate encryption key is base64 encoded', () => {
      process.env.NODE_ENV = 'development';
      process.env.MASTER_ENCRYPTION_KEY = 'invalid-base64!!!';

      expect(() => loadEnvironmentConfig()).toThrow(
        'MASTER_ENCRYPTION_KEY must be a valid base64-encoded string',
      );
    });

    it('should validate encryption key is at least 32 bytes', () => {
      process.env.NODE_ENV = 'development';
      process.env.MASTER_ENCRYPTION_KEY = Buffer.from('short').toString('base64');

      expect(() => loadEnvironmentConfig()).toThrow(
        'MASTER_ENCRYPTION_KEY must be a valid base64-encoded string of at least 32 bytes',
      );
    });

    it('should accept valid encryption key', () => {
      process.env.NODE_ENV = 'development';
      const validKey = Buffer.from('a'.repeat(32)).toString('base64');
      process.env.MASTER_ENCRYPTION_KEY = validKey;

      const config = loadEnvironmentConfig();

      expect(config.masterEncryptionKey).toBe(validKey);
    });

    it('should skip encryption key validation in test environment', () => {
      process.env.NODE_ENV = 'test';
      process.env.MASTER_ENCRYPTION_KEY = 'invalid';

      // Should not throw in test environment
      expect(() => loadEnvironmentConfig()).not.toThrow();
    });
  });

  describe('validateEnvironmentConfig', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should log startup information', () => {
      process.env.NODE_ENV = 'development';
      validateEnvironmentConfig();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Starting API in development mode'),
      );
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('API Port: 3001'));
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Supabase URL: http://localhost:54321'),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Redis URL: redis://localhost:6379'),
      );
    });

    it('should warn about missing Solana RPC URL in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.MASTER_ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');
      delete process.env.SOLANA_RPC_URL;

      validateEnvironmentConfig();

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('SOLANA_RPC_URL not configured'),
      );
    });

    it('should log error and throw on validation failure', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SUPABASE_URL;

      expect(() => validateEnvironmentConfig()).toThrow();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Environment validation failed'),
        expect.any(String),
      );
    });
  });

  describe('Environment detection', () => {
    it('should default to development when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      const config = loadEnvironmentConfig();

      expect(config.nodeEnv).toBe(Environment.Development);
    });

    it('should recognize staging environment', () => {
      process.env.NODE_ENV = 'staging';
      const config = loadEnvironmentConfig();

      expect(config.nodeEnv).toBe(Environment.Staging);
    });

    it('should recognize test environment', () => {
      process.env.NODE_ENV = 'test';
      const config = loadEnvironmentConfig();

      expect(config.nodeEnv).toBe(Environment.Test);
    });
  });
});
