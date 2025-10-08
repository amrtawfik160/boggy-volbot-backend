import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { tradeLogger } from '../utils/logger';
import { TransactionError, RetryHandler, ErrorHandler } from '../utils/errors';
import { globalRateLimiter } from '../utils/utils';
import {
  getBuyTx,
  getBuyTxWithJupiter,
  getSellTx,
  getSellTxWithJupiter,
} from '../utils/swapOnlyAmm';
import { SWAP_ROUTING } from '../constants';
import { NATIVE_MINT } from '@solana/spl-token';
import { ExecutorFactory } from '../executor/factory';
import { TransactionExecutor } from '../executor/types';

export interface TradeResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export interface TradeStats {
  totalBuys: number;
  totalSells: number;
  successfulBuys: number;
  successfulSells: number;
  totalVolume: number;
}

export interface TradingServiceConfig {
  connection: Connection;
  rpcEndpoint: string;
  rpcWebsocketEndpoint: string;
  jitoConfig?: {
    blockEngineUrl: string;
    authKeypair: Keypair;
    tipAmount: number;
    bundleTransactionLimit?: number;
    bundleTimeoutMs?: number;
  };
}

export class TradingService {
  private connection: Connection;
  private stats: TradeStats;
  private config: TradingServiceConfig;

  constructor(config: TradingServiceConfig) {
    this.config = config;
    this.connection = config.connection;
    this.stats = {
      totalBuys: 0,
      totalSells: 0,
      successfulBuys: 0,
      successfulSells: 0,
      totalVolume: 0,
    };
  }

  async executeBuy(
    wallet: Keypair,
    baseMint: PublicKey,
    amount: number,
    poolId?: PublicKey,
    useJito: boolean = false
  ): Promise<TradeResult> {
    this.stats.totalBuys++;

    tradeLogger.info(`Executing buy transaction`, {
      wallet: wallet.publicKey.toBase58(),
      amount,
      baseMint: baseMint.toBase58(),
      useJito,
    });

    try {
      const result = await RetryHandler.withRetry(async () => {
        const transaction = await this.getBuyTransaction(wallet, baseMint, amount, poolId);

        if (!transaction) {
          throw new TransactionError('Failed to create buy transaction', {
            amount,
            baseMint: baseMint.toBase58(),
          });
        }

        const signature = await this.executeBuyTransaction(transaction, wallet, useJito);
        return signature;
      }, 3);

      this.stats.successfulBuys++;
      this.stats.totalVolume += amount;

      tradeLogger.info(`Buy transaction successful`, {
        wallet: wallet.publicKey.toBase58(),
        signature: result,
        amount,
      });

      return { success: true, signature: result };
    } catch (error) {
      const errorMessage = ErrorHandler.getErrorMessage(error);
      tradeLogger.error(`Buy transaction failed`, {
        wallet: wallet.publicKey.toBase58(),
        error: errorMessage,
        amount,
      });

      return { success: false, error: errorMessage };
    }
  }

  async executeSell(
    wallet: Keypair,
    baseMint: PublicKey,
    poolId?: PublicKey,
    useJito: boolean = false,
    options?: { tokenAmountBase?: string; percent?: number }
  ): Promise<TradeResult> {
    this.stats.totalSells++;

    tradeLogger.info(`Executing sell transaction`, {
      wallet: wallet.publicKey.toBase58(),
      baseMint: baseMint.toBase58(),
      useJito,
    });

    try {
      const result = await RetryHandler.withRetry(async () => {
        // Get token balance first
        const tokenBalance = await this.getTokenBalance(wallet, baseMint);

        if (!tokenBalance || tokenBalance === '0') {
          throw new TransactionError(
            'No tokens to sell',
            { baseMint: baseMint.toBase58() },
            undefined,
            false
          );
        }

        // Determine amount to sell (in base units)
        let amountToSellBase = tokenBalance;
        if (options?.tokenAmountBase) {
          amountToSellBase = options.tokenAmountBase;
        } else if (options?.percent != null) {
          const pct = Math.max(0, Math.min(100, options.percent));
          const num = BigInt(tokenBalance);
          amountToSellBase = ((num * BigInt(Math.floor(pct))) / BigInt(100)).toString();
        }

        const transaction = await this.getSellTransaction(wallet, baseMint, amountToSellBase, poolId);

        if (!transaction) {
          throw new TransactionError('Failed to create sell transaction', {
            baseMint: baseMint.toBase58(),
          });
        }

        const signature = await this.executeSellTransaction(transaction, wallet, useJito);
        return signature;
      }, 3);

      this.stats.successfulSells++;

      tradeLogger.info(`Sell transaction successful`, {
        wallet: wallet.publicKey.toBase58(),
        signature: result,
      });

      return { success: true, signature: result };
    } catch (error) {
      const errorMessage = ErrorHandler.getErrorMessage(error);
      tradeLogger.error(`Sell transaction failed`, {
        wallet: wallet.publicKey.toBase58(),
        error: errorMessage,
      });

      return { success: false, error: errorMessage };
    }
  }

  private async getBuyTransaction(
    wallet: Keypair,
    baseMint: PublicKey,
    amount: number,
    poolId?: PublicKey
  ): Promise<VersionedTransaction | null> {
    try {
      if (SWAP_ROUTING) {
        tradeLogger.debug('Using Jupiter routing for buy transaction');
        const transaction = await getBuyTxWithJupiter(wallet, baseMint, amount);
        if (!transaction) {
          throw new TransactionError('Jupiter buy transaction creation failed - no transaction returned');
        }
        return transaction;
      } else {
        if (!poolId) {
          throw new TransactionError('Pool ID required for Raydium direct trading');
        }
        tradeLogger.debug('Using Raydium direct for buy transaction');
        const transaction = await getBuyTx(
          this.connection,
          wallet,
          baseMint,
          NATIVE_MINT,
          amount,
          poolId.toBase58()
        );
        if (!transaction) {
          throw new TransactionError('Raydium buy transaction creation failed');
        }
        return transaction;
      }
    } catch (error) {
      tradeLogger.error('Failed to create buy transaction', { 
        error: error instanceof Error ? error.message : String(error),
        wallet: wallet.publicKey.toBase58(),
        amount,
      });
      throw error; // Don't return null, let the error propagate
    }
  }

  private async getSellTransaction(
    wallet: Keypair,
    baseMint: PublicKey,
    tokenAmount: string,
    poolId?: PublicKey
  ): Promise<VersionedTransaction | null> {
    try {
      if (SWAP_ROUTING) {
        tradeLogger.debug('Using Jupiter routing for sell transaction');
        return await getSellTxWithJupiter(wallet, baseMint, tokenAmount);
      } else {
        if (!poolId) {
          throw new TransactionError('Pool ID required for Raydium direct trading');
        }
        tradeLogger.debug('Using Raydium direct for sell transaction');
        return await getSellTx(
          this.connection,
          wallet,
          baseMint,
          NATIVE_MINT,
          tokenAmount,
          poolId.toBase58()
        );
      }
    } catch (error) {
      tradeLogger.error('Failed to create sell transaction', { error });
      return null;
    }
  }

  private async executeBuyTransaction(
    transaction: VersionedTransaction,
    wallet: Keypair,
    useJito: boolean = false
  ): Promise<string> {
    // Apply rate limiting before transaction execution
    await globalRateLimiter.waitForSlot();

    // Create executor based on useJito flag
    const executor = this.createExecutor(useJito);

    tradeLogger.debug(`Executing buy transaction with ${useJito ? 'Jito' : 'legacy'} executor`);

    const result = await executor.execute(transaction, wallet, { isBuy: true });

    if (!result.success) {
      throw new TransactionError(result.error || 'Transaction execution failed');
    }

    return result.signature || 'bundled';
  }

  private async executeSellTransaction(
    transaction: VersionedTransaction,
    wallet: Keypair,
    useJito: boolean = false
  ): Promise<string> {
    // Apply rate limiting before transaction execution
    await globalRateLimiter.waitForSlot();

    // Create executor based on useJito flag
    const executor = this.createExecutor(useJito);

    tradeLogger.debug(`Executing sell transaction with ${useJito ? 'Jito' : 'legacy'} executor`);

    const result = await executor.execute(transaction, wallet, { isBuy: false });

    if (!result.success) {
      throw new TransactionError(result.error || 'Transaction execution failed');
    }

    return result.signature || 'bundled';
  }

  /**
   * Create the appropriate executor based on campaign configuration
   */
  private createExecutor(useJito: boolean): TransactionExecutor {
    return ExecutorFactory.fromEnvironment(
      useJito,
      this.config.rpcEndpoint,
      this.config.rpcWebsocketEndpoint,
      this.connection,
      this.config.jitoConfig
    );
  }

  private async getTokenBalance(wallet: Keypair, baseMint: PublicKey, maxRetries: number = 10): Promise<string | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Add exponential delay for settlement
        if (attempt > 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          tradeLogger.debug(`Waiting ${delay}ms for token settlement (attempt ${attempt})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        const { getAssociatedTokenAddress } = await import('@solana/spl-token');
        const tokenAta = await getAssociatedTokenAddress(baseMint, wallet.publicKey);
        
        // Check if the token account exists
        const accountInfo = await this.connection.getAccountInfo(tokenAta, 'confirmed');
        if (!accountInfo) {
          if (attempt === maxRetries) {
            tradeLogger.debug('Token account does not exist after all retries', {
              wallet: wallet.publicKey.toBase58(),
              baseMint: baseMint.toBase58(),
              attempts: attempt,
            });
          }
          continue;
        }
        
        const tokenBalance = await this.connection.getTokenAccountBalance(tokenAta, 'confirmed');
        
        if (tokenBalance?.value?.uiAmount && tokenBalance.value.uiAmount > 0) {
          tradeLogger.debug('Token balance found', {
            wallet: wallet.publicKey.toBase58(),
            balance: tokenBalance.value.uiAmount,
            attempts: attempt,
          });
          return tokenBalance.value.amount;
        }
        
        if (attempt < maxRetries) {
          tradeLogger.debug(`Token balance still zero, retrying... (${attempt}/${maxRetries})`);
        }
      } catch (error) {
        if (attempt === maxRetries) {
          tradeLogger.error('Failed to get token balance after all retries', { 
            error: error instanceof Error ? error.message : String(error), 
            attempts: attempt 
          });
        }
      }
    }
    
    tradeLogger.debug('No token balance found after all attempts', {
      wallet: wallet.publicKey.toBase58(),
      baseMint: baseMint.toBase58(),
    });
    return null;
  }

  getStats(): TradeStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      totalBuys: 0,
      totalSells: 0,
      successfulBuys: 0,
      successfulSells: 0,
      totalVolume: 0,
    };
    tradeLogger.info('Trading statistics reset');
  }

  getBuySuccessRate(): number {
    return this.stats.totalBuys > 0 ? (this.stats.successfulBuys / this.stats.totalBuys) * 100 : 0;
  }

  getSellSuccessRate(): number {
    return this.stats.totalSells > 0
      ? (this.stats.successfulSells / this.stats.totalSells) * 100
      : 0;
  }
}


