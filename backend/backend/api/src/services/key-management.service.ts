import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { SupabaseService } from './supabase.service';

@Injectable()
export class KeyManagementService {
  private readonly logger = new Logger(KeyManagementService.name);

  constructor(
    private readonly encryption: EncryptionService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * Get or create a DEK for a user
   * @param userId - User ID
   * @returns Decrypted DEK
   */
  async getUserDEK(userId: string): Promise<Buffer> {
    try {
      // Try to get existing DEK
      const dekRecord = await this.supabase.getUserEncryptionKey(userId);

      if (dekRecord) {
        // Decrypt the DEK with KEK
        const dek = this.encryption.decryptDEK(dekRecord.encrypted_dek);
        this.logger.log(`Retrieved DEK for user ${userId}`);
        return dek;
      }

      // No DEK exists, create one
      return await this.createUserDEK(userId);
    } catch (error) {
      this.logger.error(`Failed to get user DEK for ${userId}`, error);
      throw new Error('Failed to retrieve user encryption key');
    }
  }

  /**
   * Create a new DEK for a user
   * @param userId - User ID
   * @returns Decrypted DEK
   */
  async createUserDEK(userId: string): Promise<Buffer> {
    try {
      // Generate a new DEK
      const dek = this.encryption.generateDEK();

      // Encrypt the DEK with KEK
      const encryptedDEK = this.encryption.encryptDEK(dek);

      // Store encrypted DEK in database
      await this.supabase.createUserEncryptionKey({
        user_id: userId,
        encrypted_dek: encryptedDEK,
        key_version: 1,
      });

      this.logger.log(`Created new DEK for user ${userId}`);
      return dek;
    } catch (error) {
      this.logger.error(`Failed to create user DEK for ${userId}`, error);
      throw new Error('Failed to create user encryption key');
    }
  }

  /**
   * Rotate a user's DEK (re-encrypt all wallets with new key)
   * @param userId - User ID
   * @returns New DEK
   */
  async rotateUserDEK(userId: string): Promise<void> {
    try {
      this.logger.log(`Starting DEK rotation for user ${userId}`);

      // Get old DEK
      const oldDEKRecord = await this.supabase.getUserEncryptionKey(userId);
      if (!oldDEKRecord) {
        throw new NotFoundException('User DEK not found');
      }

      const oldDEK = this.encryption.decryptDEK(oldDEKRecord.encrypted_dek);

      // Get all user wallets
      const wallets = await this.supabase.getWalletsByUserIdWithPrivateKeys(
        userId,
      );

      // Generate new DEK
      const newDEK = this.encryption.generateDEK();
      const encryptedNewDEK = this.encryption.encryptDEK(newDEK);

      // Re-encrypt all wallet private keys
      for (const wallet of wallets) {
        if (wallet.encrypted_private_key) {
          // Decrypt with old DEK
          const privateKey = this.encryption.decryptWithDEK(
            wallet.encrypted_private_key,
            oldDEK,
          );

          // Encrypt with new DEK
          const newEncryptedKey = this.encryption.encryptWithDEK(
            privateKey,
            newDEK,
          );

          // Update wallet
          await this.supabase.updateWalletPrivateKey(
            wallet.id,
            newEncryptedKey,
          );
        }
      }

      // Update user's DEK record
      const newVersion = oldDEKRecord.key_version + 1;
      await this.supabase.updateUserEncryptionKey(userId, {
        encrypted_dek: encryptedNewDEK,
        key_version: newVersion,
      });

      this.logger.log(
        `Completed DEK rotation for user ${userId}. Re-encrypted ${wallets.length} wallets.`,
      );
    } catch (error) {
      this.logger.error(`Failed to rotate user DEK for ${userId}`, error);
      throw new Error('Failed to rotate user encryption key');
    }
  }

  /**
   * Encrypt a private key for a user
   * @param userId - User ID
   * @param privateKey - Private key to encrypt
   * @returns Encrypted private key
   */
  async encryptPrivateKeyForUser(
    userId: string,
    privateKey: string,
  ): Promise<Buffer> {
    const dek = await this.getUserDEK(userId);
    return this.encryption.encryptWithDEK(privateKey, dek);
  }

  /**
   * Decrypt a private key for a user
   * @param userId - User ID
   * @param encryptedPrivateKey - Encrypted private key
   * @returns Decrypted private key
   */
  async decryptPrivateKeyForUser(
    userId: string,
    encryptedPrivateKey: Buffer,
  ): Promise<string> {
    const dek = await this.getUserDEK(userId);
    return this.encryption.decryptWithDEK(encryptedPrivateKey, dek);
  }

  /**
   * Delete a user's DEK (for account deletion)
   * WARNING: This will make all encrypted wallets unrecoverable
   * @param userId - User ID
   */
  async deleteUserDEK(userId: string): Promise<void> {
    try {
      await this.supabase.deleteUserEncryptionKey(userId);
      this.logger.warn(`Deleted DEK for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to delete user DEK for ${userId}`, error);
      throw new Error('Failed to delete user encryption key');
    }
  }
}
