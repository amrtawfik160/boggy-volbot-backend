import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';

/**
 * Common result type for transaction execution
 */
export interface TransactionExecutionResult {
  success: boolean;
  signature?: string;
  error?: string;
}

/**
 * Configuration for transaction executors
 */
export interface ExecutorConfig {
  connection: Connection;
  rpcEndpoint: string;
  rpcWebsocketEndpoint: string;
}

/**
 * Configuration specific to Jito executor
 */
export interface JitoExecutorConfig extends ExecutorConfig {
  blockEngineUrl: string;
  jitoAuthKeypair: Keypair;
  jitoTipAmount: number;
  bundleTransactionLimit?: number;
  bundleTimeoutMs?: number;
}

/**
 * Unified interface for transaction executors
 * All executors (Legacy, Jito, future executors) must implement this interface
 */
export interface TransactionExecutor {
  /**
   * Execute a single transaction
   * @param transaction - The versioned transaction to execute
   * @param signerKeypair - The keypair used to sign/pay for the transaction
   * @param options - Optional execution parameters
   * @returns Promise<TransactionExecutionResult>
   */
  execute(
    transaction: VersionedTransaction,
    signerKeypair: Keypair,
    options?: ExecutionOptions
  ): Promise<TransactionExecutionResult>;

  /**
   * Execute multiple transactions (batch/bundle)
   * @param transactions - Array of versioned transactions
   * @param signerKeypair - The keypair used to sign/pay for the transactions
   * @param options - Optional execution parameters
   * @returns Promise<TransactionExecutionResult>
   */
  executeBatch(
    transactions: VersionedTransaction[],
    signerKeypair: Keypair,
    options?: ExecutionOptions
  ): Promise<TransactionExecutionResult>;

  /**
   * Get the executor type identifier
   */
  getType(): ExecutorType;
}

/**
 * Optional parameters for transaction execution
 */
export interface ExecutionOptions {
  /** Whether this is a buy transaction (for logging) */
  isBuy?: boolean;
  /** Maximum number of retries */
  maxRetries?: number;
  /** Skip preflight checks */
  skipPreflight?: boolean;
  /** Custom commitment level */
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

/**
 * Executor type enum
 */
export enum ExecutorType {
  LEGACY = 'legacy',
  JITO = 'jito',
}
