import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly tagLength = 16;
  private kek: Buffer | null = null;

  constructor() {
    this.initializeKEK();
  }

  /**
   * Initialize KEK on service startup
   */
  private initializeKEK(): void {
    const masterKey = this.getMasterKey();
    this.kek = this.deriveKEK(masterKey);
    this.logger.log('KEK initialized successfully');
  }

  /**
   * Get master key from environment
   */
  private getMasterKey(): Buffer {
    const masterKey = process.env.MASTER_ENCRYPTION_KEY;
    if (!masterKey) {
      this.logger.fatal('MASTER_ENCRYPTION_KEY not configured');
      throw new Error('MASTER_ENCRYPTION_KEY not set in environment');
    }
    // Decode base64 master key and ensure it's 32 bytes
    try {
      const key = Buffer.from(masterKey, 'base64');
      if (key.length !== this.keyLength) {
        throw new Error(`Master key must be ${this.keyLength} bytes`);
      }
      return key;
    } catch (error) {
      this.logger.error('Invalid MASTER_ENCRYPTION_KEY format', error);
      throw new Error('MASTER_ENCRYPTION_KEY must be a valid base64-encoded 32-byte key');
    }
  }

  /**
   * Derive KEK from master key using HKDF-SHA256
   */
  private deriveKEK(masterKey: Buffer): Buffer {
    const info = Buffer.from('kek-v1', 'utf8');
    const salt = Buffer.alloc(0); // No salt for simplicity (master key is already random)

    // Use HKDF from crypto.hkdfSync (Node.js 15+)
    return crypto.hkdfSync('sha256', masterKey, salt, info, this.keyLength);
  }

  /**
   * Get the KEK (should only be used internally)
   */
  private getKEK(): Buffer {
    if (!this.kek) {
      throw new Error('KEK not initialized');
    }
    return this.kek;
  }

  /**
   * Generate a new Data Encryption Key (DEK) for a user
   * @returns 32-byte DEK
   */
  generateDEK(): Buffer {
    return crypto.randomBytes(this.keyLength);
  }

  /**
   * Encrypt a DEK with the KEK
   * @param dek - Data Encryption Key to encrypt
   * @returns Encrypted DEK: [IV(16) + Ciphertext + AuthTag(16)]
   */
  encryptDEK(dek: Buffer): Buffer {
    try {
      const kek = this.getKEK();
      const iv = crypto.randomBytes(this.ivLength);

      const cipher = crypto.createCipheriv(this.algorithm, kek, iv);

      const encrypted = Buffer.concat([
        cipher.update(dek),
        cipher.final(),
      ]);

      const tag = cipher.getAuthTag();

      // Return: iv + encrypted + tag
      return Buffer.concat([iv, encrypted, tag]);
    } catch (error) {
      this.logger.error('Failed to encrypt DEK', error);
      throw new Error('DEK encryption failed');
    }
  }

  /**
   * Decrypt a DEK using the KEK
   * @param encryptedDEK - Encrypted DEK: [IV(16) + Ciphertext + AuthTag(16)]
   * @returns Decrypted DEK
   */
  decryptDEK(encryptedDEK: Buffer): Buffer {
    try {
      const kek = this.getKEK();

      // Extract iv, encrypted data, and tag
      const iv = encryptedDEK.subarray(0, this.ivLength);
      const tag = encryptedDEK.subarray(encryptedDEK.length - this.tagLength);
      const encrypted = encryptedDEK.subarray(
        this.ivLength,
        encryptedDEK.length - this.tagLength,
      );

      const decipher = crypto.createDecipheriv(this.algorithm, kek, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted;
    } catch (error) {
      if (error.message?.includes('Unsupported state or unable to authenticate data')) {
        this.logger.error('DEK decryption authentication failed - data tampered or wrong key');
        throw new Error('Unable to decrypt DEK. Authentication failed.');
      }
      this.logger.error('Failed to decrypt DEK', error);
      throw new Error('DEK decryption failed');
    }
  }

  /**
   * Encrypt data with a DEK (typically a private key)
   * @param plaintext - Data to encrypt
   * @param dek - Data Encryption Key
   * @returns Encrypted data: [IV(16) + Ciphertext + AuthTag(16)]
   */
  encryptWithDEK(plaintext: string, dek: Buffer): Buffer {
    try {
      if (dek.length !== this.keyLength) {
        throw new Error(`DEK must be ${this.keyLength} bytes`);
      }

      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, dek, iv);

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);

      const tag = cipher.getAuthTag();

      // Return: iv + encrypted + tag
      return Buffer.concat([iv, encrypted, tag]);
    } catch (error) {
      this.logger.error('Failed to encrypt with DEK', error);
      throw new Error('Encryption with DEK failed');
    }
  }

  /**
   * Decrypt data with a DEK
   * @param encryptedData - Encrypted data: [IV(16) + Ciphertext + AuthTag(16)]
   * @param dek - Data Encryption Key
   * @returns Decrypted plaintext
   */
  decryptWithDEK(encryptedData: Buffer, dek: Buffer): string {
    try {
      if (dek.length !== this.keyLength) {
        throw new Error(`DEK must be ${this.keyLength} bytes`);
      }

      // Extract iv, encrypted data, and tag
      const iv = encryptedData.subarray(0, this.ivLength);
      const tag = encryptedData.subarray(encryptedData.length - this.tagLength);
      const encrypted = encryptedData.subarray(
        this.ivLength,
        encryptedData.length - this.tagLength,
      );

      const decipher = crypto.createDecipheriv(this.algorithm, dek, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      if (error.message?.includes('Unsupported state or unable to authenticate data')) {
        this.logger.error('Decryption authentication failed - data tampered or wrong key');
        throw new Error('Unable to decrypt data. Authentication failed.');
      }
      this.logger.error('Failed to decrypt with DEK', error);
      throw new Error('Decryption with DEK failed');
    }
  }

  /**
   * Encrypt a private key (legacy method - uses master key directly)
   * @deprecated Use encryptWithDEK for new implementations
   */
  encrypt(privateKey: string): Buffer {
    const key = this.getMasterKey();
    const iv = crypto.randomBytes(this.ivLength);

    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(privateKey, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    // Return: iv + encrypted + tag
    return Buffer.concat([iv, encrypted, tag]);
  }

  /**
   * Decrypt a private key (legacy method - uses master key directly)
   * @deprecated Use decryptWithDEK for new implementations
   */
  decrypt(encryptedData: Buffer): string {
    try {
      const key = this.getMasterKey();

      // Extract iv, encrypted data, and tag
      const iv = encryptedData.subarray(0, this.ivLength);
      const tag = encryptedData.subarray(encryptedData.length - this.tagLength);
      const encrypted = encryptedData.subarray(
        this.ivLength,
        encryptedData.length - this.tagLength,
      );

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error) {
      if (error.message?.includes('Unsupported state or unable to authenticate data')) {
        this.logger.error('Decryption authentication failed - data tampered or wrong key');
        throw new Error('Unable to decrypt wallet. Data may be corrupted.');
      }
      this.logger.error('Decryption failed', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Hash a value for comparison (one-way)
   */
  hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}

