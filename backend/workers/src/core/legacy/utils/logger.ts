// Simplified logger for immediate functionality
const createLogger = (name: string) => ({
  info: (message: string, data?: any) => {
    console.log(`[${name}] INFO: ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, data?: any) => {
    console.error(`[${name}] ERROR: ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[${name}] WARN: ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  debug: (message: string, data?: any) => {
    console.log(`[${name}] DEBUG: ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
});

export const logger = createLogger('BOT');

// Create child loggers for different modules
export const createModuleLogger = (module: string) => createLogger(module);

// Specific loggers for different parts of the application
export const tradeLogger = createModuleLogger('TRADE');
export const walletLogger = createModuleLogger('WALLET');
export const poolLogger = createModuleLogger('POOL');
export const distributionLogger = createModuleLogger('DISTRIBUTION');
export const executionLogger = createModuleLogger('EXECUTION');


