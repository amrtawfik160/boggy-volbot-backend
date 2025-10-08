import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import {
  TransactionExecutor,
  TransactionExecutionResult,
  ExecutorConfig,
  ExecutorType,
  ExecutionOptions,
} from './types';

/**
 * Legacy transaction executor
 * Executes transactions directly via RPC without bundling
 */
export class LegacyExecutor implements TransactionExecutor {
  private connection: Connection;
  private config: ExecutorConfig;

  constructor(config: ExecutorConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcEndpoint, {
      wsEndpoint: config.rpcWebsocketEndpoint,
    });
  }

  /**
   * Execute a single transaction using legacy RPC method
   */
  async execute(
    transaction: VersionedTransaction,
    signerKeypair: Keypair,
    options?: ExecutionOptions
  ): Promise<TransactionExecutionResult> {
    const isBuy = options?.isBuy ?? true;
    const maxRetries = options?.maxRetries ?? 3;
    const skipPreflight = options?.skipPreflight ?? true;
    const commitment = options?.commitment ?? 'confirmed';

    try {
      console.log(`[LEGACY EXECUTOR] Sending ${isBuy ? 'buy' : 'sell'} transaction...`);

      // Get latest blockhash
      const latestBlockhash = await this.connection.getLatestBlockhash('processed');

      // Send transaction
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight,
          maxRetries,
        }
      );

      console.log(`[LEGACY EXECUTOR] Transaction sent with signature: ${signature}`);

      // Confirm transaction
      const confirmation = await this.connection.confirmTransaction(
        {
          signature,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          blockhash: latestBlockhash.blockhash,
        },
        commitment
      );

      if (confirmation.value.err) {
        const errorMsg = JSON.stringify(confirmation.value.err);
        console.error(`[LEGACY EXECUTOR] Transaction failed:`, confirmation.value.err);
        return {
          success: false,
          error: `Transaction confirmation failed: ${errorMsg}`,
        };
      }

      console.log(
        `Success in ${isBuy ? 'buy' : 'sell'} transaction: https://solscan.io/tx/${signature}`
      );

      return {
        success: true,
        signature,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LEGACY EXECUTOR] ${isBuy ? 'Buy' : 'Sell'} transaction failed:`, error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Execute multiple transactions sequentially
   * Note: Legacy executor doesn't support true batching/bundling
   */
  async executeBatch(
    transactions: VersionedTransaction[],
    signerKeypair: Keypair,
    options?: ExecutionOptions
  ): Promise<TransactionExecutionResult> {
    console.log(`[LEGACY EXECUTOR] Executing batch of ${transactions.length} transactions sequentially`);

    const results: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const result = await this.execute(transactions[i], signerKeypair, {
        ...options,
        isBuy: options?.isBuy ?? true,
      });

      if (result.success && result.signature) {
        results.push(result.signature);
      } else if (result.error) {
        errors.push(`Transaction ${i}: ${result.error}`);
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        error: errors.join('; '),
        signature: results.length > 0 ? results.join(',') : undefined,
      };
    }

    return {
      success: true,
      signature: results.join(','),
    };
  }

  getType(): ExecutorType {
    return ExecutorType.LEGACY;
  }

  /**
   * Get the connection instance
   */
  getConnection(): Connection {
    return this.connection;
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use LegacyExecutor class instead
 */
export const execute = async (
  transaction: VersionedTransaction,
  latestBlockhash: { blockhash: string; lastValidBlockHeight: number },
  isBuy: boolean = true
): Promise<string> => {
  // This is kept for backward compatibility
  // New code should use LegacyExecutor class
  const connection = new Connection(process.env.RPC_ENDPOINT || '', {
    wsEndpoint: process.env.RPC_WEBSOCKET_ENDPOINT,
  });

  try {
    console.log(`[EXECUTOR] Sending ${isBuy ? 'buy' : 'sell'} transaction...`);
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 3,
    });

    console.log(`[EXECUTOR] Transaction sent with signature: ${signature}`);

    const confirmation = await connection.confirmTransaction(
      {
        signature,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        blockhash: latestBlockhash.blockhash,
      },
      'confirmed'
    );

    if (confirmation.value.err) {
      console.error(`[EXECUTOR] Transaction failed:`, confirmation.value.err);
      throw new Error(`Transaction confirmation failed: ${JSON.stringify(confirmation.value.err)}`);
    } else {
      if (isBuy) {
        console.log(`Success in buy transaction: https://solscan.io/tx/${signature}`);
      } else {
        console.log(`Success in Sell transaction: https://solscan.io/tx/${signature}`);
      }
    }

    return signature;
  } catch (error) {
    console.error(`[EXECUTOR] ${isBuy ? 'Buy' : 'Sell'} transaction failed:`, error);
    throw error;
  }
};
