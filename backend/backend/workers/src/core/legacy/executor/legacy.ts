/**
 * Legacy executor module - Backward compatibility wrapper
 *
 * This file maintains backward compatibility with existing code
 * that imports from './executor/legacy'
 *
 * @deprecated Import from './executor/legacy-executor' instead
 */

export { execute, LegacyExecutor } from './legacy-executor';
export * from './types';
