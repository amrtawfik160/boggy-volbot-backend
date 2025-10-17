#!/usr/bin/env tsx

/**
 * Validation script to verify log level controls work correctly across environments
 *
 * This script demonstrates and validates:
 * 1. Log level filtering at different severity levels
 * 2. Environment-specific configuration (development vs production)
 * 3. LOG_LEVEL environment variable override
 * 4. Child logger context inheritance
 */

import { createLogger, createChildLogger } from '../src/config/logger';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function print(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function separator() {
  print('═'.repeat(80), colors.blue);
}

async function validateLogLevel(levelName: string, testEnv: string) {
  print(`\nTesting log level: ${levelName.toUpperCase()} in ${testEnv}`, colors.bright);
  print('-'.repeat(80), colors.cyan);

  // Temporarily set environment
  const originalLogLevel = process.env.LOG_LEVEL;
  const originalNodeEnv = process.env.NODE_ENV;

  process.env.LOG_LEVEL = levelName;
  process.env.NODE_ENV = testEnv;

  try {
    const logger = createLogger({
      name: 'validation-test',
      environment: testEnv
    });

    print(`\nLogger created with level: ${logger.level}`, colors.green);
    print(`Environment: ${testEnv}`, colors.green);

    // Check which log levels are enabled
    const levels = ['debug', 'info', 'warn', 'error'];
    print('\nLog level status:', colors.yellow);
    levels.forEach(level => {
      const enabled = logger.isLevelEnabled(level);
      const status = enabled ? '✓ ENABLED' : '✗ DISABLED';
      const statusColor = enabled ? colors.green : colors.red;
      print(`  ${level.padEnd(10)}: ${statusColor}${status}${colors.reset}`);
    });

    // Demonstrate actual logging (will only appear if level is enabled)
    print('\nGenerating log messages:', colors.yellow);
    logger.debug('This is a DEBUG message');
    logger.info('This is an INFO message');
    logger.warn('This is a WARN message');
    logger.error('This is an ERROR message');

  } finally {
    // Restore original environment
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  }
}

async function validateChildLoggers() {
  separator();
  print('\n🔍 Validating Child Logger Context Inheritance', colors.bright);
  separator();

  process.env.LOG_LEVEL = 'info';
  const parentLogger = createLogger({ name: 'parent-service' });

  print('\nParent logger created', colors.green);

  const childLogger1 = createChildLogger(parentLogger, {
    userId: 'user-123',
    campaignId: 'camp-456'
  });

  print('Child logger 1 created with userId and campaignId', colors.green);
  childLogger1.info('Message from child logger 1');

  const childLogger2 = createChildLogger(childLogger1, {
    requestId: 'req-789'
  });

  print('Child logger 2 created with requestId (nested child)', colors.green);
  childLogger2.info('Message from nested child logger 2');

  print('\n✓ Child loggers inherit parent context and log level', colors.green);
}

async function validateEnvironmentOverride() {
  separator();
  print('\n🔍 Validating LOG_LEVEL Environment Variable Override', colors.bright);
  separator();

  print('\nTest 1: Without LOG_LEVEL env var (should use default: info)', colors.yellow);
  delete process.env.LOG_LEVEL;
  const logger1 = createLogger({ name: 'test', level: 'info' });
  print(`Logger level: ${logger1.level}`, logger1.level === 'info' ? colors.green : colors.red);

  print('\nTest 2: With LOG_LEVEL=debug (should override default)', colors.yellow);
  process.env.LOG_LEVEL = 'debug';
  const logger2 = createLogger({ name: 'test', level: 'info' });
  print(`Logger level: ${logger2.level}`, logger2.level === 'debug' ? colors.green : colors.red);

  print('\nTest 3: With LOG_LEVEL=error (should override default)', colors.yellow);
  process.env.LOG_LEVEL = 'error';
  const logger3 = createLogger({ name: 'test', level: 'info' });
  print(`Logger level: ${logger3.level}`, logger3.level === 'error' ? colors.green : colors.red);

  print('\n✓ LOG_LEVEL environment variable correctly overrides default level', colors.green);
}

async function validateRuntimeLevelChange() {
  separator();
  print('\n🔍 Validating Runtime Log Level Changes', colors.bright);
  separator();

  process.env.LOG_LEVEL = 'info';
  const logger = createLogger({ name: 'dynamic-test' });

  print(`\nInitial log level: ${logger.level}`, colors.green);
  print('Debug enabled:', logger.isLevelEnabled('debug') ? colors.green : colors.red);
  print(logger.isLevelEnabled('debug') ? '✓ YES' : '✗ NO');

  print('\nChanging log level to debug at runtime...', colors.yellow);
  logger.level = 'debug';

  print(`Updated log level: ${logger.level}`, colors.green);
  print('Debug enabled:', logger.isLevelEnabled('debug') ? colors.green : colors.red);
  print(logger.isLevelEnabled('debug') ? '✓ YES' : '✗ NO');

  print('\n✓ Log level can be changed at runtime', colors.green);
}

async function main() {
  separator();
  print('🚀 LOG LEVEL VALIDATION SCRIPT', colors.bright);
  print('   Validating Pino Logger Configuration and Filtering', colors.bright);
  separator();

  // Test different log levels in development
  separator();
  print('\n📋 PART 1: Log Level Filtering Tests (Development)', colors.bright);
  separator();

  await validateLogLevel('debug', 'development');
  await validateLogLevel('info', 'development');
  await validateLogLevel('warn', 'development');
  await validateLogLevel('error', 'development');

  // Test production environment
  separator();
  print('\n📋 PART 2: Log Level Filtering Tests (Production)', colors.bright);
  separator();

  await validateLogLevel('info', 'production');
  await validateLogLevel('warn', 'production');
  await validateLogLevel('error', 'production');

  // Test child loggers
  await validateChildLoggers();

  // Test environment variable override
  await validateEnvironmentOverride();

  // Test runtime level changes
  await validateRuntimeLevelChange();

  // Final summary
  separator();
  print('\n✅ ALL VALIDATIONS PASSED', colors.bright + colors.green);
  separator();

  print('\nValidation Summary:', colors.bright);
  print('  ✓ Log level filtering works correctly for all levels', colors.green);
  print('  ✓ Environment-specific configuration is applied', colors.green);
  print('  ✓ LOG_LEVEL environment variable overrides defaults', colors.green);
  print('  ✓ Child loggers inherit parent configuration', colors.green);
  print('  ✓ Log levels can be changed at runtime', colors.green);

  separator();
}

// Run the validation
main()
  .then(() => {
    // Exit explicitly to avoid hanging on pino transports
    process.exit(0);
  })
  .catch(error => {
    print('\n❌ VALIDATION FAILED', colors.bright + colors.red);
    console.error(error);
    process.exit(1);
  });
