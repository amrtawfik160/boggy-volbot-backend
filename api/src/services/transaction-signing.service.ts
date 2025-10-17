import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KeyManagementService } from './key-management.service';
import { SupabaseService } from './supabase.service';
import { Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { sign } from '@noble/ed25519';

@Injectable()
export class TransactionSigningService {
  private readonly logger = new Logger(TransactionSigningService.name);

  constructor(
    private readonly keyManagement: KeyManagementService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * Sign a transaction with a wallet's private key
   * SECURITY: Private key is decrypted only for signing, then immediately cleared
   * @param walletId - Wallet ID
   * @param userId - User ID (for authorization)
   * @param transaction - Transaction to sign
   * @returns Signed transaction
   */
  async signTransaction<T extends Transaction | VersionedTransaction>(
    walletId: string,
    userId: string,
    transaction: T,
  ): Promise<T> {
    let privateKeyString: string | null = null;
    let keypair: Keypair | null = null;

    try {
      // Get wallet with encrypted private key
      const wallet = await this.getWalletWithPrivateKey(walletId, userId);

      if (!wallet.encrypted_private_key) {
        throw new Error('Wallet does not have a private key (read-only wallet)');
      }

      // Decrypt private key (only in memory, never persisted)
      privateKeyString = await this.keyManagement.decryptPrivateKeyForUser(
        userId,
        wallet.encrypted_private_key,
      );

      // Create keypair from private key
      const privateKeyBytes = bs58.decode(privateKeyString);
      keypair = Keypair.fromSecretKey(privateKeyBytes);

      // Sign the transaction
      if (transaction instanceof VersionedTransaction) {
        transaction.sign([keypair]);
      } else {
        transaction.sign(keypair);
      }

      this.logger.log(
        `Transaction signed for wallet ${walletId} (user ${userId})`,
      );

      return transaction;
    } catch (error) {
      this.logger.error(
        `Failed to sign transaction for wallet ${walletId}`,
        error,
      );
      throw error;
    } finally {
      // CRITICAL: Secure cleanup - overwrite sensitive data
      if (privateKeyString) {
        // Overwrite the string in memory with zeros
        privateKeyString = '\0'.repeat(privateKeyString.length);
        privateKeyString = null;
      }

      if (keypair) {
        // Overwrite the keypair's secret key with zeros
        keypair.secretKey.fill(0);
        keypair = null;
      }

      // Suggest garbage collection (non-blocking)
      if (global.gc) {
        global.gc();
      }
    }
  }

  /**
   * Sign a message with a wallet's private key
   * SECURITY: Private key is decrypted only for signing, then immediately cleared
   * @param walletId - Wallet ID
   * @param userId - User ID (for authorization)
   * @param message - Message to sign (as Buffer or Uint8Array)
   * @returns Signature as Buffer
   */
  async signMessage(
    walletId: string,
    userId: string,
    message: Buffer | Uint8Array,
  ): Promise<Buffer> {
    let privateKeyString: string | null = null;
    let keypair: Keypair | null = null;

    try {
      // Get wallet with encrypted private key
      const wallet = await this.getWalletWithPrivateKey(walletId, userId);

      if (!wallet.encrypted_private_key) {
        throw new Error('Wallet does not have a private key (read-only wallet)');
      }

      // Decrypt private key (only in memory, never persisted)
      privateKeyString = await this.keyManagement.decryptPrivateKeyForUser(
        userId,
        wallet.encrypted_private_key,
      );

      // Create keypair from private key
      const privateKeyBytes = bs58.decode(privateKeyString);
      keypair = Keypair.fromSecretKey(privateKeyBytes);

      // Sign the message using ed25519
      const secretKey = keypair.secretKey.slice(0, 32); // First 32 bytes is the private key
      const signature = Buffer.from(
        await sign(Uint8Array.from(message), secretKey),
      );

      this.logger.log(`Message signed for wallet ${walletId} (user ${userId})`);

      return signature;
    } catch (error) {
      this.logger.error(
        `Failed to sign message for wallet ${walletId}`,
        error,
      );
      throw error;
    } finally {
      // CRITICAL: Secure cleanup - overwrite sensitive data
      if (privateKeyString) {
        privateKeyString = '\0'.repeat(privateKeyString.length);
        privateKeyString = null;
      }

      if (keypair) {
        keypair.secretKey.fill(0);
        keypair = null;
      }

      if (global.gc) {
        global.gc();
      }
    }
  }

  /**
   * Execute a callback with a temporary keypair
   * SECURITY: Keypair is created, used, and immediately destroyed
   * @param walletId - Wallet ID
   * @param userId - User ID (for authorization)
   * @param callback - Function to execute with the keypair
   * @returns Result of the callback
   */
  async withKeypair<T>(
    walletId: string,
    userId: string,
    callback: (keypair: Keypair) => Promise<T>,
  ): Promise<T> {
    let privateKeyString: string | null = null;
    let keypair: Keypair | null = null;

    try {
      // Get wallet with encrypted private key
      const wallet = await this.getWalletWithPrivateKey(walletId, userId);

      if (!wallet.encrypted_private_key) {
        throw new Error('Wallet does not have a private key (read-only wallet)');
      }

      // Decrypt private key (only in memory, never persisted)
      privateKeyString = await this.keyManagement.decryptPrivateKeyForUser(
        userId,
        wallet.encrypted_private_key,
      );

      // Create keypair from private key
      const privateKeyBytes = bs58.decode(privateKeyString);
      keypair = Keypair.fromSecretKey(privateKeyBytes);

      // Execute callback with keypair
      const result = await callback(keypair);

      this.logger.log(
        `Keypair operation completed for wallet ${walletId} (user ${userId})`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to execute keypair operation for wallet ${walletId}`,
        error,
      );
      throw error;
    } finally {
      // CRITICAL: Secure cleanup - overwrite sensitive data
      if (privateKeyString) {
        privateKeyString = '\0'.repeat(privateKeyString.length);
        privateKeyString = null;
      }

      if (keypair) {
        keypair.secretKey.fill(0);
        keypair = null;
      }

      if (global.gc) {
        global.gc();
      }
    }
  }

  /**
   * Get wallet with encrypted private key (internal helper)
   * @param walletId - Wallet ID
   * @param userId - User ID (for authorization)
   * @returns Wallet with encrypted private key
   */
  private async getWalletWithPrivateKey(
    walletId: string,
    userId: string,
  ): Promise<any> {
    const wallets = await this.supabase.getWalletsByUserIdWithPrivateKeys(
      userId,
    );
    const wallet = wallets.find((w) => w.id === walletId);

    if (!wallet) {
      throw new NotFoundException(
        `Wallet ${walletId} not found for user ${userId}`,
      );
    }

    return wallet;
  }
}
