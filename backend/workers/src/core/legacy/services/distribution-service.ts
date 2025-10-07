import {
  Keypair,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import base58 from 'bs58';
import { Data, saveDataToFile } from '../utils/utils';
import { distributionLogger } from '../utils/logger';
import { DistributionError, RetryHandler } from '../utils/errors';
import { DISTRIBUTION_AMOUNT, ADDITIONAL_FEE } from '../constants';

export interface DistributionResult {
  success: boolean;
  wallets: Array<{
    kp: Keypair;
    buyAmount: number;
  }>;
  totalDistributed: number;
  failed: number;
}

export class DistributionService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async distributeSol(
    mainKp: Keypair,
    distributionNum: number
  ): Promise<DistributionResult> {
    distributionLogger.info(`Starting SOL distribution to ${distributionNum} wallets`);

    try {
      // Validate main wallet balance with more realistic fee calculation
      const mainBalance = await this.getWalletBalance(mainKp.publicKey);
      const priorityFeePerTx = Math.max(ADDITIONAL_FEE, 50000) / LAMPORTS_PER_SOL;
      const baseFeePerTx = 0.000005; // Base transaction fee
      const totalFeePerTx = priorityFeePerTx + baseFeePerTx;
      const requiredAmount = (DISTRIBUTION_AMOUNT + totalFeePerTx) * distributionNum + 0.001; // Extra buffer
      
      distributionLogger.info('Balance validation', {
        mainBalance,
        requiredAmount,
        distributionAmount: DISTRIBUTION_AMOUNT,
        feePerTransaction: totalFeePerTx,
        totalWallets: distributionNum,
      });

      if (mainBalance < requiredAmount) {
        throw new DistributionError(
          `Insufficient balance for distribution. Required: ${requiredAmount.toFixed(6)} SOL, Available: ${mainBalance.toFixed(6)} SOL`,
          distributionNum,
          requiredAmount
        );
      }

      const wallets = this.generateWallets(distributionNum);
      const distributionResult = await this.executeDistribution(mainKp, wallets);

      distributionLogger.info(`Distribution completed successfully`, {
        totalWallets: distributionNum,
        successfulDistributions: distributionResult.wallets.length,
        totalDistributed: distributionResult.totalDistributed,
      });

      return distributionResult;
    } catch (error) {
      distributionLogger.error('Distribution failed', { error });
      throw error;
    }
  }

  private generateWallets(count: number): Keypair[] {
    distributionLogger.debug(`Generating ${count} wallets`);
    const wallets: Keypair[] = [];

    for (let i = 0; i < count; i++) {
      wallets.push(Keypair.generate());
    }

    return wallets;
  }

  private async executeDistribution(
    mainKp: Keypair,
    wallets: Keypair[]
  ): Promise<DistributionResult> {
    const data: Data[] = [];
    const successfulWallets: Array<{ kp: Keypair; buyAmount: number }> = [];
    let totalDistributed = 0;
    let failed = 0;

    for (const [index, wallet] of wallets.entries()) {
      try {
        await RetryHandler.withRetry(async () => {
          const signature = await this.transferSol(mainKp, wallet.publicKey, DISTRIBUTION_AMOUNT);
          
          distributionLogger.debug(`SOL transferred to wallet ${index + 1}`, {
            wallet: wallet.publicKey.toBase58(),
            amount: DISTRIBUTION_AMOUNT,
            signature,
          });

          // Save wallet data
          data.push({
            privateKey: base58.encode(wallet.secretKey),
            pubkey: wallet.publicKey.toBase58(),
            solBalance: DISTRIBUTION_AMOUNT,
            tokenBuyTx: null,
            tokenSellTx: null,
          });

          successfulWallets.push({
            kp: wallet,
            buyAmount: DISTRIBUTION_AMOUNT,
          });

          totalDistributed += DISTRIBUTION_AMOUNT;
          
          // Verify the balance was actually received
          await this.verifyWalletBalance(wallet.publicKey, DISTRIBUTION_AMOUNT);
          
          // Add delay between transactions to avoid RPC overload
          if (index < wallets.length - 1) {
            distributionLogger.debug(`Waiting before next distribution...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }, 3);
      } catch (error) {
        distributionLogger.error(`Failed to distribute to wallet ${index + 1}`, {
          wallet: wallet.publicKey.toBase58(),
          error,
        });
        failed++;
      }
    }

    // Save all wallet data to file
    if (data.length > 0) {
      saveDataToFile(data);
      distributionLogger.info(`Saved ${data.length} wallet records to data.json`);
    }

    return {
      success: failed === 0,
      wallets: successfulWallets,
      totalDistributed,
      failed,
    };
  }

  private async transferSol(
    fromKeypair: Keypair,
    toPublicKey: PublicKey,
    amount: number
  ): Promise<string> {
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    
    try {
      const transaction = new Transaction();
      
      // Add compute budget instructions with higher fees
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: Math.max(ADDITIONAL_FEE, 50000), // Minimum 50k microLamports
        })
      );
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 20000, // Set compute unit limit
        })
      );

      // Add transfer instruction
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey: toPublicKey,
          lamports,
        })
      );

      // Get recent blockhash with higher commitment
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromKeypair.publicKey;

      // Sign and send transaction
      transaction.sign(fromKeypair);
      
      // Send with skip preflight to avoid simulation errors
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: true,
          maxRetries: 3,
        }
      );

      distributionLogger.debug(`Transaction sent with signature: ${signature}`);

      // Wait for confirmation with timeout
      const confirmation = await this.connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      return signature;
    } catch (error) {
      distributionLogger.error(`Transfer failed for amount ${amount} SOL`, {
        fromPubkey: fromKeypair.publicKey.toBase58(),
        toPubkey: toPublicKey.toBase58(),
        amount,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async getWalletBalance(publicKey: PublicKey): Promise<number> {
    const balance = await this.connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  private async verifyWalletBalance(
    publicKey: PublicKey,
    expectedAmount: number,
    maxRetries: number = 5
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential delay
      
      const balance = await this.getWalletBalance(publicKey);
      
      distributionLogger.debug(`Balance check attempt ${attempt}`, {
        wallet: publicKey.toBase58(),
        expectedAmount,
        actualBalance: balance,
      });
      
      if (balance >= expectedAmount * 0.95) { // Allow 5% tolerance for fees
        distributionLogger.debug(`Balance verification successful`, {
          wallet: publicKey.toBase58(),
          balance,
        });
        return;
      }
      
      if (attempt === maxRetries) {
        distributionLogger.warn(`Balance verification failed after ${maxRetries} attempts`, {
          wallet: publicKey.toBase58(),
          expectedAmount,
          actualBalance: balance,
        });
      }
    }
  }

  async validateDistribution(distributionNum: number): Promise<void> {
    if (distributionNum <= 0) {
      throw new DistributionError('Distribution number must be greater than 0');
    }
    if (distributionNum > 20) {
      throw new DistributionError('Distribution number exceeds maximum limit of 20 wallets');
    }
  }
}

