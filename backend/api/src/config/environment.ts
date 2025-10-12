/**
 * Centralized environment configuration and validation
 * Validates all required environment variables on startup
 */

export enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
  Test = 'test',
}

export interface EnvironmentConfig {
  // Node environment
  nodeEnv: Environment;
  apiPort: number;

  // Supabase (Required in production)
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;

  // Redis (Required in production)
  redisUrl: string;

  // Security (Required in production)
  masterEncryptionKey: string;

  // Solana RPC (Optional, uses defaults)
  solanaRpcUrl?: string;

  // CORS (Optional)
  corsOrigin?: string;

  // Trading defaults (Optional, can be overridden per campaign)
  buyLowerAmount?: number;
  buyUpperAmount?: number;
  distributeWalletNum?: number;
}

/**
 * Validates and loads environment configuration
 * Throws an error if required variables are missing in production
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  const nodeEnv = (process.env.NODE_ENV as Environment) || Environment.Development;
  const isProduction = nodeEnv === Environment.Production;
  const isTest = nodeEnv === Environment.Test;

  // Required in production
  const requiredInProduction = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    redisUrl: process.env.REDIS_URL,
    masterEncryptionKey: process.env.MASTER_ENCRYPTION_KEY,
  };

  // Validate required production variables
  if (isProduction) {
    const missing: string[] = [];
    Object.entries(requiredInProduction).forEach(([key, value]) => {
      if (!value) {
        missing.push(key);
      }
    });

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables in production: ${missing.join(', ')}. ` +
        'Please check your environment configuration.',
      );
    }
  }

  // Validate encryption key format if provided
  if (requiredInProduction.masterEncryptionKey) {
    try {
      const decoded = Buffer.from(requiredInProduction.masterEncryptionKey, 'base64');
      if (decoded.length < 32) {
        throw new Error('MASTER_ENCRYPTION_KEY must be at least 32 bytes when base64 decoded');
      }
    } catch (error) {
      if (!isTest) {
        throw new Error(
          'MASTER_ENCRYPTION_KEY must be a valid base64-encoded string of at least 32 bytes',
        );
      }
    }
  }

  return {
    nodeEnv,
    apiPort: process.env.API_PORT ? Number(process.env.API_PORT) : 3001,

    // Supabase - use defaults in dev/test, required in production
    supabaseUrl: requiredInProduction.supabaseUrl || 'http://localhost:54321',
    supabaseAnonKey: requiredInProduction.supabaseAnonKey || 'test-anon-key',
    supabaseServiceRoleKey:
      requiredInProduction.supabaseServiceRoleKey || 'test-service-key',

    // Redis - use default in dev/test, required in production
    redisUrl: requiredInProduction.redisUrl || 'redis://localhost:6379',

    // Security - use test key in dev/test, required in production
    masterEncryptionKey:
      requiredInProduction.masterEncryptionKey ||
      Buffer.from('test-master-key-32-bytes-long!!').toString('base64'),

    // Optional configurations
    solanaRpcUrl: process.env.SOLANA_RPC_URL,
    corsOrigin: process.env.CORS_ORIGIN,
    buyLowerAmount: process.env.BUY_LOWER_AMOUNT
      ? Number(process.env.BUY_LOWER_AMOUNT)
      : undefined,
    buyUpperAmount: process.env.BUY_UPPER_AMOUNT
      ? Number(process.env.BUY_UPPER_AMOUNT)
      : undefined,
    distributeWalletNum: process.env.DISTRIBUTE_WALLET_NUM
      ? Number(process.env.DISTRIBUTE_WALLET_NUM)
      : undefined,
  };
}

/**
 * Validates the environment configuration and logs warnings
 */
export function validateEnvironmentConfig(): EnvironmentConfig {
  try {
    const config = loadEnvironmentConfig();

    // Log environment info
    console.log(`🚀 Starting API in ${config.nodeEnv} mode`);
    console.log(`📡 API Port: ${config.apiPort}`);
    console.log(`🗄️  Supabase URL: ${config.supabaseUrl}`);
    console.log(`📦 Redis URL: ${config.redisUrl}`);

    // Warn about missing optional variables
    if (!config.solanaRpcUrl && config.nodeEnv === Environment.Production) {
      console.warn(
        '⚠️  SOLANA_RPC_URL not configured. Using default Solana RPC endpoint.',
      );
    }

    return config;
  } catch (error) {
    console.error('❌ Environment validation failed:', error instanceof Error ? error.message : error);
    throw error;
  }
}

/**
 * Global environment configuration instance
 */
let environmentConfig: EnvironmentConfig | null = null;

/**
 * Get the validated environment configuration
 * Must be called after validateEnvironmentConfig()
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  if (!environmentConfig) {
    environmentConfig = validateEnvironmentConfig();
  }
  return environmentConfig;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return getEnvironmentConfig().nodeEnv === Environment.Production;
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return getEnvironmentConfig().nodeEnv === Environment.Development;
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return getEnvironmentConfig().nodeEnv === Environment.Test;
}
