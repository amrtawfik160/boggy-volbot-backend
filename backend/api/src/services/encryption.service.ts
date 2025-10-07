import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly tagLength = 16;

  private getMasterKey(): Buffer {
    const masterKey = process.env.MASTER_ENCRYPTION_KEY;
    if (!masterKey) {
      throw new Error('MASTER_ENCRYPTION_KEY not set in environment');
    }
    // Ensure key is 32 bytes
    return crypto.scryptSync(masterKey, 'salt', this.keyLength);
  }

  /**
   * Encrypt a private key
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
   * Decrypt a private key
   */
  decrypt(encryptedData: Buffer): string {
    const key = this.getMasterKey();
    
    // Extract iv, encrypted data, and tag
    const iv = encryptedData.subarray(0, this.ivLength);
    const tag = encryptedData.subarray(encryptedData.length - this.tagLength);
    const encrypted = encryptedData.subarray(this.ivLength, encryptedData.length - this.tagLength);
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    return decrypted.toString('utf8');
  }

  /**
   * Hash a value for comparison (one-way)
   */
  hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}

