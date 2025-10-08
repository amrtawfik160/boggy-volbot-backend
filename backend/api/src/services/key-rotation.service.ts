import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { EncryptionService } from './encryption.service';
import { SupabaseService } from './supabase.service';

export interface RotationProgress {
  total: number;
  completed: number;
  failed: number;
  userIds: string[];
  failedUserIds: string[];
  startTime: Date;
  lastUpdated: Date;
}

export interface RotationBackup {
  userId: string;
  encryptedDEK: Buffer;
  keyVersion: number;
}

@Injectable()
export class KeyRotationService {
  private readonly logger = new Logger(KeyRotationService.name);
  private readonly keyLength = 32;
  private rotationInProgress = false;

  constructor(
    private readonly encryption: EncryptionService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * Rotate the master key and re-encrypt all user DEKs
   * @param newMasterKey - New master key (base64 encoded)
   * @param batchSize - Number of users to process per batch (default: 10)
   * @returns Rotation progress
   */
  async rotateMasterKey(
    newMasterKey: string,
    batchSize = 10,
  ): Promise<RotationProgress> {
    if (this.rotationInProgress) {
      throw new Error('Key rotation already in progress');
    }

    this.rotationInProgress = true;
    this.logger.warn('Starting master key rotation - this may take a while');

    const startTime = new Date();
    const progress: RotationProgress = {
      total: 0,
      completed: 0,
      failed: 0,
      userIds: [],
      failedUserIds: [],
      startTime,
      lastUpdated: startTime,
    };

    try {
      // Validate new master key
      const newMasterKeyBuffer = this.validateMasterKey(newMasterKey);

      // Derive new KEK from new master key
      const newKEK = this.deriveKEK(newMasterKeyBuffer);

      // Get old KEK using reflection (accessing private property for rotation)
      const oldKEK = this.getCurrentKEK();

      // Get all user encryption keys
      const allUsers = await this.supabase.getAllUserEncryptionKeys();
      progress.total = allUsers.length;
      this.logger.log(`Found ${allUsers.length} users to process`);

      // Create backup before rotation
      const backup: RotationBackup[] = allUsers.map((user) => ({
        userId: user.user_id,
        encryptedDEK: user.encrypted_dek,
        keyVersion: user.key_version,
      }));

      // Process users in batches
      for (let i = 0; i < allUsers.length; i += batchSize) {
        const batch = allUsers.slice(i, i + batchSize);

        await Promise.allSettled(
          batch.map(async (user) => {
            try {
              await this.rotateUserDEKWithNewKEK(
                user.user_id,
                user.encrypted_dek,
                oldKEK,
                newKEK,
                user.key_version,
              );

              progress.completed++;
              progress.userIds.push(user.user_id);
              this.logger.log(
                `Rotated DEK for user ${user.user_id} (${progress.completed}/${progress.total})`,
              );
            } catch (error) {
              progress.failed++;
              progress.failedUserIds.push(user.user_id);
              this.logger.error(
                `Failed to rotate DEK for user ${user.user_id}`,
                error,
              );
            }
          }),
        );

        progress.lastUpdated = new Date();
      }

      // Log final results
      if (progress.failed > 0) {
        this.logger.warn(
          `Master key rotation completed with ${progress.failed} failures. ` +
            `Successfully rotated ${progress.completed}/${progress.total} users.`,
        );
        this.logger.warn(
          `Failed user IDs: ${progress.failedUserIds.join(', ')}`,
        );
      } else {
        this.logger.log(
          `Master key rotation completed successfully. Rotated ${progress.completed} users.`,
        );
      }

      return progress;
    } catch (error) {
      this.logger.error('Master key rotation failed critically', error);
      throw error;
    } finally {
      this.rotationInProgress = false;
    }
  }

  /**
   * Rollback a user's DEK to a previous encrypted value
   * @param userId - User ID
   * @param encryptedDEK - Previous encrypted DEK
   * @param keyVersion - Previous key version
   */
  async rollbackUserDEK(
    userId: string,
    encryptedDEK: Buffer,
    keyVersion: number,
  ): Promise<void> {
    try {
      await this.supabase.updateUserEncryptionKey(userId, {
        encrypted_dek: encryptedDEK,
        key_version: keyVersion,
      });
      this.logger.log(`Rolled back DEK for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to rollback DEK for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Verify that all user DEKs can be decrypted with current KEK
   * @returns Verification results
   */
  async verifyAllDEKs(): Promise<{
    total: number;
    successful: number;
    failed: number;
    failedUserIds: string[];
  }> {
    this.logger.log('Starting DEK verification');

    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      failedUserIds: [] as string[],
    };

    try {
      const allUsers = await this.supabase.getAllUserEncryptionKeys();
      results.total = allUsers.length;

      for (const user of allUsers) {
        try {
          // Try to decrypt the DEK
          const dek = this.encryption.decryptDEK(user.encrypted_dek);

          // Verify it's the right length
          if (dek.length !== this.keyLength) {
            throw new Error(`Invalid DEK length: ${dek.length}`);
          }

          results.successful++;
        } catch (error) {
          results.failed++;
          results.failedUserIds.push(user.user_id);
          this.logger.error(
            `Failed to verify DEK for user ${user.user_id}`,
            error,
          );
        }
      }

      this.logger.log(
        `DEK verification complete: ${results.successful}/${results.total} successful`,
      );

      if (results.failed > 0) {
        this.logger.warn(
          `Failed to verify ${results.failed} DEKs: ${results.failedUserIds.join(', ')}`,
        );
      }

      return results;
    } catch (error) {
      this.logger.error('DEK verification failed', error);
      throw error;
    }
  }

  /**
   * Rotate a single user's DEK encrypted with a new KEK
   * @private
   */
  private async rotateUserDEKWithNewKEK(
    userId: string,
    encryptedDEK: Buffer,
    oldKEK: Buffer,
    newKEK: Buffer,
    currentVersion: number,
  ): Promise<void> {
    // Decrypt DEK with old KEK
    const dek = this.decryptDEKWithKEK(encryptedDEK, oldKEK);

    // Encrypt DEK with new KEK
    const newEncryptedDEK = this.encryptDEKWithKEK(dek, newKEK);

    // Update in database
    await this.supabase.updateUserEncryptionKey(userId, {
      encrypted_dek: newEncryptedDEK,
      key_version: currentVersion + 1,
    });
  }

  /**
   * Validate master key format and length
   * @private
   */
  private validateMasterKey(masterKey: string): Buffer {
    try {
      const key = Buffer.from(masterKey, 'base64');
      if (key.length !== this.keyLength) {
        throw new Error(`Master key must be ${this.keyLength} bytes`);
      }
      return key;
    } catch (error) {
      throw new Error(
        `Invalid master key format: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Derive KEK from master key using HKDF-SHA256
   * @private
   */
  private deriveKEK(masterKey: Buffer): Buffer {
    const info = Buffer.from('kek-v1', 'utf8');
    const salt = Buffer.alloc(0);
    return crypto.hkdfSync('sha256', masterKey, salt, info, this.keyLength);
  }

  /**
   * Get current KEK (using reflection to access private property)
   * @private
   */
  private getCurrentKEK(): Buffer {
    // Access private kek property through reflection
    const kek = (this.encryption as any).kek as Buffer | null;
    if (!kek) {
      throw new Error('Current KEK not available');
    }
    return kek;
  }

  /**
   * Decrypt DEK with specific KEK (independent of current service state)
   * @private
   */
  private decryptDEKWithKEK(encryptedDEK: Buffer, kek: Buffer): Buffer {
    const ivLength = 16;
    const tagLength = 16;

    const iv = encryptedDEK.subarray(0, ivLength);
    const ciphertext = encryptedDEK.subarray(
      ivLength,
      encryptedDEK.length - tagLength,
    );
    const tag = encryptedDEK.subarray(encryptedDEK.length - tagLength);

    const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Encrypt DEK with specific KEK (independent of current service state)
   * @private
   */
  private encryptDEKWithKEK(dek: Buffer, kek: Buffer): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);

    const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, encrypted, tag]);
  }

  /**
   * Check if rotation is currently in progress
   */
  isRotationInProgress(): boolean {
    return this.rotationInProgress;
  }
}
