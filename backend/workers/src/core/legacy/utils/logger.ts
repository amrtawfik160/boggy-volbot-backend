/**
 * Legacy logger - now uses Pino for structured logging
 * Kept for backwards compatibility with legacy code
 */
import { createLogger as createPinoLogger } from '../../../config/logger';

const createLogger = (name: string) => createPinoLogger({ name });

export const logger = createLogger('bot');

// Create child loggers for different modules
export const createModuleLogger = (module: string) => createLogger(module.toLowerCase());

// Specific loggers for different parts of the application
export const tradeLogger = createModuleLogger('trade');
export const walletLogger = createModuleLogger('wallet');
export const poolLogger = createModuleLogger('pool');
export const distributionLogger = createModuleLogger('distribution');
export const executionLogger = createModuleLogger('execution');


