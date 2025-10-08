import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import {
  TransactionExecutor,
  TransactionExecutionResult,
  JitoExecutorConfig,
  ExecutorType,
  ExecutionOptions,
} from './types';
import { SearcherClient, searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher';
import { Bundle } from 'jito-ts/dist/sdk/block-engine/types';
import { isError } from 'jito-ts/dist/sdk/block-engine/utils';

/**
 * Jito transaction executor
 * Executes transactions using Jito bundles for MEV protection and faster landing
 */
export class JitoExecutor implements TransactionExecutor {
  private connection: Connection;
  private config: JitoExecutorConfig;
  private searcherClient: SearcherClient;

  constructor(config: JitoExecutorConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcEndpoint, {
      wsEndpoint: config.rpcWebsocketEndpoint,
    });
    this.searcherClient = searcherClient(
      config.blockEngineUrl,
      config.jitoAuthKeypair
    );
  }

  /**
   * Execute a single transaction as a Jito bundle
   */
  async execute(
    transaction: VersionedTransaction,
    signerKeypair: Keypair,
    options?: ExecutionOptions
  ): Promise<TransactionExecutionResult> {
    // Single transaction is executed as a bundle with one transaction
    return this.executeBatch([transaction], signerKeypair, options);
  }

  /**
   * Execute multiple transactions as a Jito bundle
   */
  async executeBatch(
    transactions: VersionedTransaction[],
    signerKeypair: Keypair,
    options?: ExecutionOptions
  ): Promise<TransactionExecutionResult> {
    const isBuy = options?.isBuy ?? true;

    try {
      console.log(
        `[JITO EXECUTOR] Executing bundle with ${transactions.length} transactions (${isBuy ? 'buy' : 'sell'})`
      );

      // Split into chunks if needed (Jito bundles have transaction limits)
      const bundleLimit = this.config.bundleTransactionLimit ?? 4;
      const chunks = this.chunkTransactions(transactions, bundleLimit);

      let successfulBundles = 0;
      const errors: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(
          `[JITO EXECUTOR] Processing bundle ${i + 1}/${chunks.length} with ${chunk.length} transactions`
        );

        try {
          const bundleResult = await this.executeBundle(chunk, signerKeypair);

          if (bundleResult) {
            successfulBundles++;
          } else {
            errors.push(`Bundle ${i + 1} failed to land`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Bundle ${i + 1} error: ${errorMsg}`);
        }
      }

      if (successfulBundles === 0) {
        return {
          success: false,
          error: `All bundles failed: ${errors.join('; ')}`,
        };
      }

      if (errors.length > 0) {
        return {
          success: true,
          signature: 'bundled', // Jito doesn't return specific signatures
          error: `Partial success: ${errors.join('; ')}`,
        };
      }

      console.log(`[JITO EXECUTOR] All ${successfulBundles} bundles executed successfully`);
      return {
        success: true,
        signature: 'bundled',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[JITO EXECUTOR] Bundle execution failed:`, error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute a single bundle
   */
  private async executeBundle(
    transactions: VersionedTransaction[],
    signerKeypair: Keypair
  ): Promise<boolean> {
    try {
      const bundleLimit = this.config.bundleTransactionLimit ?? 4;

      // Get tip accounts
      const tipAccounts = await this.searcherClient.getTipAccounts();
      const tipAccount = this.selectTipAccount(tipAccounts);

      if (!tipAccount) {
        throw new Error('No tip accounts available');
      }

      // Create bundle
      const bundle = new Bundle([], bundleLimit);
      const latestBlockhash = await this.connection.getLatestBlockhash('processed');

      // Add transactions to bundle
      bundle.addTransactions(...transactions);

      // Add tip transaction
      const maybeBundle = bundle.addTipTx(
        signerKeypair,
        this.config.jitoTipAmount,
        new PublicKey(tipAccount),
        latestBlockhash.blockhash
      );

      if (isError(maybeBundle)) {
        throw maybeBundle;
      }

      // Send bundle
      await this.searcherClient.sendBundle(maybeBundle);

      // Wait for bundle result
      const bundleResult = await this.waitForBundleResult(
        this.searcherClient,
        this.config.bundleTimeoutMs ?? 30000
      );

      return bundleResult > 0;
    } catch (error) {
      console.error('[JITO EXECUTOR] Bundle execution error:', error);
      throw error;
    }
  }

  /**
   * Select a random tip account
   */
  private selectTipAccount(accounts: string[]): string | null {
    if (!accounts || accounts.length === 0) {
      return null;
    }

    // Select from first 4 accounts randomly
    const index = Math.min(Math.floor(Math.random() * accounts.length), 3);
    return accounts[index];
  }

  /**
   * Wait for bundle result with timeout
   */
  private waitForBundleResult(
    client: SearcherClient,
    timeoutMs: number
  ): Promise<number> {
    let isResolved = false;
    let acceptedCount = 0;

    return new Promise((resolve) => {
      // Timeout handler
      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          console.log(`[JITO EXECUTOR] Bundle result timeout after ${timeoutMs}ms`);
          resolve(acceptedCount);
        }
      }, timeoutMs);

      // Listen for bundle results
      client.onBundleResult(
        (result: any) => {
          if (isResolved) return;

          const isAccepted = result.accepted;
          const isRejected = result.rejected;

          if (isAccepted) {
            acceptedCount++;
            isResolved = true;
            clearTimeout(timeout);
            console.log('[JITO EXECUTOR] Bundle accepted');
            resolve(acceptedCount);
          }

          if (isRejected) {
            console.log('[JITO EXECUTOR] Bundle rejected:', result.rejected);
          }
        },
        (error: any) => {
          console.error('[JITO EXECUTOR] Bundle result error:', error);
        }
      );
    });
  }

  /**
   * Chunk transactions into batches
   */
  private chunkTransactions(
    transactions: VersionedTransaction[],
    chunkSize: number
  ): VersionedTransaction[][] {
    const chunks: VersionedTransaction[][] = [];

    for (let i = 0; i < transactions.length; i += chunkSize) {
      chunks.push(transactions.slice(i, i + chunkSize));
    }

    return chunks;
  }

  getType(): ExecutorType {
    return ExecutorType.JITO;
  }

  /**
   * Get the connection instance
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get the searcher client instance
   */
  getSearcherClient(): SearcherClient {
    return this.searcherClient;
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use JitoExecutor class instead
 */
export async function bundle(
  txs: VersionedTransaction[],
  keypair: Keypair
): Promise<boolean> {
  // This is kept for backward compatibility
  // New code should use JitoExecutor class
  try {
    const txNum = Math.ceil(txs.length / 3);

    for (let i = 0; i < txNum; i++) {
      const upperIndex = (i + 1) * 3;
      const downIndex = i * 3;
      const newTxs: VersionedTransaction[] = [];

      for (let j = downIndex; j < upperIndex; j++) {
        if (txs[j]) newTxs.push(txs[j]!);
      }

      const success = await bull_dozer(newTxs, keypair);
      return success;
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use JitoExecutor class instead
 */
export async function bull_dozer(
  txs: VersionedTransaction[],
  keypair: Keypair
): Promise<boolean> {
  // This is kept for backward compatibility
  // Actual implementation would need to be migrated to use JitoExecutor
  console.warn('bull_dozer is deprecated, use JitoExecutor instead');
  return false;
}
