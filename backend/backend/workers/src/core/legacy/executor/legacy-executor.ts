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

      // Get latest blockhash for confirmation
      const latestBlockhash = await this.connection.getLatestBlockhash('processed');

      // Sign transaction with the provided keypair
      // Note: VersionedTransaction.sign() behaves like partialSign - it adds signatures without removing existing ones
      // However, to ensure fresh signatures and avoid stale blockhash issues, we sign here
      transaction.sign([signerKeypair]);

      // Verify transaction is properly signed
      if (!this.isTransactionSigned(transaction)) {
        throw new Error('Transaction signing failed - missing required signatures');
      }

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
   * Verify that a transaction has all required signatures
   * @param transaction - The transaction to verify
   * @returns boolean indicating if transaction is properly signed
   */
  private isTransactionSigned(transaction: VersionedTransaction): boolean {
    // Get the number of required signatures from the message
    const numRequiredSignatures = transaction.message.header.numRequiredSignatures;

    // Check if we have at least the required number of signatures
    // Note: signatures array should match the number of required signatures
    return transaction.signatures.length >= numRequiredSignatures &&
           transaction.signatures.slice(0, numRequiredSignatures).every(sig => sig !== null && sig.length === 64);
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
